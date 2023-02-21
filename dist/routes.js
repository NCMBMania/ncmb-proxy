"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routing = void 0;
const yaml_1 = __importDefault(require("yaml"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importDefault(require("axios"));
const passport_1 = __importDefault(require("passport"));
const passport_twitter_1 = require("passport-twitter");
const str = fs_1.default.readFileSync('./setting.yaml');
const setting = yaml_1.default.parse(str.toString());
let websocket = null;
const connections = new Map;
// Setting for Twitter auth
if (setting.twitter) {
    const strategy = new passport_twitter_1.Strategy({
        consumerKey: setting.twitter.consumerKey,
        consumerSecret: setting.twitter.consumerSecret,
        callbackURL: '/auth/twitter/callback'
    }, (accessToken, tokenSecret, profile, done) => __awaiter(void 0, void 0, void 0, function* () {
        return done(null, Object.assign(Object.assign({}, profile), { accessToken, tokenSecret }));
    }));
    passport_1.default.use(strategy);
    passport_1.default.serializeUser((user, done) => {
        done(null, user);
    });
    passport_1.default.deserializeUser(function (obj, done) {
        done(null, false);
    });
}
const getRequest = (method, originalUrl, params, data, contentType, session) => {
    const time = new Date().toISOString();
    const baseUrl = originalUrl.replace(/\?.*/, '');
    const domain = baseUrl.indexOf(setting.ncmb.version) === 1 ? setting.ncmb.domain : setting.ncmb.script.domain;
    const signature = createSignature(method, domain, time, baseUrl, params);
    const headers = {
        [setting.ncmb.headers.applicationKey]: setting.ncmb.applicationKey,
        [setting.ncmb.headers.timestamp]: time,
        [setting.ncmb.headers.signature]: signature,
    };
    headers["Content-Type"] = contentType;
    if (session) {
        headers[setting.ncmb.headers.session] = session;
    }
    return { url: `https://${domain}${baseUrl}`, domain, headers, method, params, data };
};
const routing = (router, wss) => {
    const request = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        const requestConfig = getRequest(req.method, req.originalUrl, req.query, req.body, req.headers['content-type'], req.headers[setting.ncmb.headers.session]);
        try {
            // ファイルストアへのGETリクエストであれば、レスポンスはArrayBufferで返す
            const reg = new RegExp(`^/${setting.ncmb.version}/files/`);
            const responseType = req.method.toUpperCase() == 'GET' && reg.test(req.baseUrl) ? 'arraybuffer' : 'json';
            const response = yield (0, axios_1.default)(Object.assign(Object.assign({}, requestConfig), { responseType }));
            // レスポンスのヘッダーで判別
            const contentType = response.headers["content-type"];
            if (contentType === 'application/json') {
                // JSONであればそのまま
                res.json(response.data);
            }
            else {
                // Arraybufferの場合は、レスポンスヘッダーを設定して、そのまま返す
                res.setHeader('content-type', contentType);
                res.send(response.data);
            }
            // 監査ログ
            if (setting.ncmb.audit) {
                const auditConfig = getRequest('POST', `/${setting.ncmb.version}/classes/_auditLogs/`, {}, {
                    "method": req.method,
                    "requestUrl": req.originalUrl.replace(/\?.*/, ''),
                    "query": req.query,
                    "body": req.body,
                    "headers": req.headers,
                    "response": response.data,
                    "responseContentType": response.headers['content-type'],
                    "session": req.headers[setting.ncmb.headers.session],
                    "acl": {
                        "role:Administrator": {
                            "read": true,
                            "write": true
                        }
                    }
                }, "application/json", "");
                yield (0, axios_1.default)(Object.assign(Object.assign({}, auditConfig), { responseType: "json" }));
            }
            // 検索系なら除外
            if (req.method.toUpperCase() === 'GET')
                return;
            // データストア以外は除外（ユーザー、ファイルストア、プッシュ通知など）
            const info = getObjectInfo(req.path);
            if (info) {
                // WebSocketで通知
                const action = req.method.toUpperCase() === 'POST' ? 'create' : req.method.toUpperCase() === 'PUT' ? 'update' : 'delete';
                const keys = [
                    `datastore_${info.className}_${info.objectId}`,
                    `datastore_${info.className}_${action}`,
                ];
                for (const path of connections.keys()) {
                    if (keys.indexOf(path) == -1)
                        continue;
                    const ws = connections.get(path);
                    if (ws) {
                        const data = Object.assign({ action, objectId: info.objectId }, response.data);
                        ws.forEach(w => w.send(JSON.stringify(data)));
                    }
                }
            }
        }
        catch (e) {
            const err = e;
            err.response && res.status(err.response.status).json(err.response.data);
        }
    });
    router.all('/script/:fileName', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        if (setting.ncmb.script.no_signature.indexOf(req.params.fileName) === -1) {
            return res.status(401).json({ code: 'E401001', error: 'Unauthorized.' });
        }
        req.originalUrl = req.originalUrl.replace('/script/', `/${setting.ncmb.script.version}/script/`);
        request(req, res);
    }));
    router.get('/auth/twitter', (req, res, done) => {
        ['callback', 'redirect'].forEach(key => {
            if (req.query[key]) {
                res.cookie(key, req.query[key], {
                    path: '/',
                    secure: true,
                    httpOnly: true,
                });
            }
        });
        done();
    }, passport_1.default.authenticate('twitter'));
    router.get('/auth/twitter/callback', passport_1.default.authenticate('twitter', { failureRedirect: '/?auth_failed' }), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
        console.log('hello');
        const user = req.user;
        const params = {
            // @ts-ignore
            id: req.user.id,
            // @ts-ignore
            screen_name: req.user.username,
            oauth_consumer_key: setting.twitter.consumerKey,
            consumer_secret: setting.twitter.consumerSecret,
            oauth_token: user.accessToken,
            oauth_token_secret: user.tokenSecret,
        };
        const config = getRequest('POST', `/${setting.ncmb.version}/users`, {}, { "authData": { "twitter": params } }, 'application/json');
        try {
            const response = yield (0, axios_1.default)(Object.assign(Object.assign({}, config), { responseType: "json" }));
            console.log(req.cookies);
            if (req.cookies.callback) {
                return res.render('callback', { callback: req.cookies.callback, data: response.data });
            }
            if (req.cookies.redirect) {
                return res.redirect(`${req.cookies.redirect}?data=${JSON.stringify(response.data)}`);
            }
            res.send(response.data);
        }
        catch (e) {
            console.error(e);
            res.send({});
        }
    }));
    router.ws('*', (ws, req) => {
        const classname = req.query.classname;
        const objectId = req.query.objectid;
        const action = req.query.action;
        if (!classname)
            return ws.close();
        if (!objectId && !action)
            return ws.close();
        const channels = [];
        if (objectId) {
            channels.push(`datastore_${classname}_${objectId}`);
        }
        else {
            const actions = action.split(',');
            actions.forEach(a => channels.push(`datastore_${classname}_${a}`));
        }
        channels.forEach(channel => {
            if (!connections.has(channel)) {
                connections.set(channel, [ws]);
            }
            else {
                const ary = connections.get(channel);
                ary.push(ws);
                connections.set(channel, ary);
            }
        });
    });
    router.all('*', request);
    return router;
};
exports.routing = routing;
const getObjectInfo = (path) => {
    const s1 = `/${setting.ncmb.version}/classes/(.*?)/(.*?)$`;
    const r1 = new RegExp(s1);
    const m1 = r1.exec(path);
    if (m1) {
        return { className: m1[1], objectId: m1[2] };
    }
    const s2 = `/${setting.ncmb.version}/classes/(.*?)$`;
    const r2 = new RegExp(s2);
    const m2 = r2.exec(path);
    if (m2) {
        return { className: m2[1], objectId: 'new' };
    }
    return null;
};
const createSignature = (method, domain, time, path, q = {}) => {
    const queries = (domain === setting.ncmb.domain) ? Object.assign({}, q) : {};
    const { signature, headers } = setting.ncmb;
    queries[signature.method.name] = signature.method.value;
    queries[signature.version.name] = signature.version.value;
    queries[headers.applicationKey] = setting.ncmb.applicationKey;
    queries[headers.timestamp] = time;
    const query = Object.keys(queries).sort().map(k => {
        const val = typeof queries[k] === 'object' ? JSON.stringify(queries[k]) : queries[k];
        return `${k}=${encodeURI(val)}`;
    }).join('&');
    const str = [
        method,
        domain,
        path,
        query
    ].join("\n");
    const hmac = crypto_1.default.createHmac('sha256', setting.ncmb.clientKey);
    return hmac.update(str).digest('base64');
};
