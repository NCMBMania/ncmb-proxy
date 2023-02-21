import { Request, Response, Router, Express, NextFunction } from "express";
import YAML from 'yaml';
import fs from 'fs';
import crypto, { secureHeapUsed } from 'crypto';
import axios, { AxiosError } from 'axios';
import multer from "multer";
import express from "express-ws";
import WebSocket, { Server } from "ws";
import { channel } from "diagnostics_channel";
import QueryString from "qs";
import passport from 'passport';
import { Strategy as TwitterStrategy } from 'passport-twitter';

const str = fs.readFileSync('./setting.yaml');
const setting = YAML.parse(str.toString());
let websocket: WebSocket | null = null;
const connections: Map<string, WebSocket[]> = new Map;

// Setting for Twitter auth
if (setting.twitter) {
	const strategy = new TwitterStrategy({
		consumerKey: setting.twitter.consumerKey,
		consumerSecret: setting.twitter.consumerSecret,
		callbackURL: setting.twitter.callbackURL,
	}, async (accessToken, tokenSecret, profile, done) => {
		return done(null, {...profile, ...{ accessToken, tokenSecret }});
	});
	passport.use(strategy);

	passport.serializeUser((user, done) => {
		done(null, user);
	});

	passport.deserializeUser(function(obj, done) {
		done(null, false);
	});
}

const getRequest = (method: string, originalUrl: string, params: QueryString.ParsedQs, data: any, contentType: string, session?: string) => {
	const time = new Date().toISOString();
	const baseUrl = originalUrl.replace(/\?.*/, '');
	const domain = baseUrl.indexOf(setting.ncmb.version) === 1 ? setting.ncmb.domain : setting.ncmb.script.domain;
	const signature = createSignature(method, domain, time, baseUrl, params);
	const headers: {[key: string]: string} = {
		[setting.ncmb.headers.applicationKey]: setting.ncmb.applicationKey,
		[setting.ncmb.headers.timestamp]: time,
		[setting.ncmb.headers.signature]: signature,
	};
	headers["Content-Type"] = contentType;
	if (session) {
		headers[setting.ncmb.headers.session] = session as string;
	}
	return { url: `https://${domain}${baseUrl}`, domain, headers, method, params, data };
};
const routing = (router: express.Application, wss: Server) => {
	const request = async (req: Request, res: Response) => {
		const requestConfig = getRequest(
			req.method,
			req.originalUrl,
			req.query,
			req.body,
			req.headers['content-type'] as string,
			req.headers[setting.ncmb.headers.session] as string | undefined
		);
		try {
			// ファイルストアへのGETリクエストであれば、レスポンスはArrayBufferで返す
			const reg = new RegExp(`^/${setting.ncmb.version}/files/`);
			const responseType = req.method.toUpperCase() == 'GET' && reg.test(req.baseUrl) ? 'arraybuffer' : 'json';
			const response = await axios({...requestConfig, ...{responseType}});
			// レスポンスのヘッダーで判別
			const contentType = response.headers["content-type"];
			if (contentType === 'application/json') {
				// JSONであればそのまま
				res.json(response.data);
			} else {
				// Arraybufferの場合は、レスポンスヘッダーを設定して、そのまま返す
				res.setHeader('content-type', contentType);
				res.send(response.data);
			}
			// 監査ログ
			if (setting.ncmb.audit) {
				const auditConfig = getRequest(
					'POST',
					`/${setting.ncmb.version}/classes/_auditLogs/`,
					{},
					{
						"method": req.method,
						"requestUrl": req.originalUrl.replace(/\?.*/, ''),
						"query": req.query,
						"body": req.body,
						"headers": req.headers,
						"response": response.data,
						"responseContentType": response.headers['content-type'] as string,
						"session": req.headers[setting.ncmb.headers.session],
						"acl": {
							"role:Administrator": {
								"read": true,
								"write": true
							}
						}
					},
					"application/json",
					""
				);
				await axios({...auditConfig, ...{responseType: "json"}});
			}
			// 検索系なら除外
			if (req.method.toUpperCase() === 'GET') return;
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
					if (keys.indexOf(path) == -1) continue;
					const ws = connections.get(path);
					if (ws) {
						
						const data = {...{ action, objectId: info.objectId }, ...response.data };
						ws.forEach(w => w.send(JSON.stringify(data)));
					}
				}
			}
		} catch (e) {
			const err = e as AxiosError;
			err.response && res.status(err.response.status).json(err.response.data);
		}
	}

	router.all('/script/:fileName', async (req: Request, res: Response) => {
		if (setting.ncmb.script.no_signature.indexOf(req.params.fileName) === -1) {
			return res.status(401).json({code: 'E401001', error: 'Unauthorized.'});
		}
		req.originalUrl = req.originalUrl.replace('/script/', `/${setting.ncmb.script.version}/script/`);
		request(req, res);
	});

	router.get('/auth/twitter', (req: Request, res: Response, done: NextFunction) => {
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
	}, passport.authenticate('twitter'));
	
	router.get('/auth/twitter/callback', passport.authenticate('twitter', { failureRedirect: '/?auth_failed' }),
		async (req: Request, res: Response) => {
			const user = req.user as any;
			const params = {
				// @ts-ignore
				id: req.user!.id,
				// @ts-ignore
				screen_name: req.user!.username,
				oauth_consumer_key: setting.twitter.consumerKey,
				consumer_secret: setting.twitter.consumerSecret,
				oauth_token: user.accessToken,
				oauth_token_secret: user.tokenSecret,
			};
			const config = getRequest(
				'POST',
				`/${setting.ncmb.version}/users`,
				{},
				{"authData": { "twitter": params}},
				'application/json',
			);
			try {
				const response = await axios({...config, ...{responseType: "json"}});
				if (req.cookies.redirect) {
					return res.redirect(`${req.cookies.redirect}?data=${JSON.stringify(response.data)}`);
				}
				return res.render('callback', { data: response.data });
			} catch (e) {
				console.error(e);
				res.send({});
			}
		}
	);
	
	router.ws('*', (ws, req) => {
		const classname = req.query.classname as string | null;
		const objectId = req.query.objectid as string | null;
		const action = req.query.action as string | null;
		if (!classname) return ws.close();
		if (!objectId && !action) return ws.close();
		const channels: string[] = [];
		if (objectId) {
			channels.push(`datastore_${classname}_${objectId}`);
		} else {
			const actions = action!.split(',');
			actions.forEach(a => channels.push(`datastore_${classname}_${a}`));
		}
		channels.forEach(channel => {
			if (!connections.has(channel)) {
				connections.set(channel, [ws]);
			} else {
				const ary = connections.get(channel);
				ary!.push(ws);
				connections.set(channel, ary!);
			}
		});
	});

	router.all('*', request);
	return router;
};

type objectInfo = {className: string, objectId: string};

const getObjectInfo = (path: string): objectInfo | null => {
	const s1 = `/${setting.ncmb.version}/classes/(.*?)/(.*?)$`;
	const r1 = new RegExp(s1);
	const m1 = r1.exec(path);
	if (m1) {
		return {className: m1[1], objectId: m1[2]};
	}
	const s2 = `/${setting.ncmb.version}/classes/(.*?)$`;
	const r2 = new RegExp(s2);
	const m2 = r2.exec(path);
	if (m2) {
		return {className: m2[1], objectId: 'new'};
	}
	return null;
}
const createSignature = (method: string, domain: string, time: string, path: string, q:{ [s: string]: any } = {}): string => {
	const queries = (domain === setting.ncmb.domain) ? {...q} : {};
	const { signature, headers } = setting.ncmb;
	queries[signature.method.name] = signature.method.value;
	queries[signature.version.name] = signature.version.value;
	queries[headers.applicationKey] = setting.ncmb.applicationKey;
	queries[headers.timestamp] = time
	const query = Object.keys(queries).sort().map(k => {
		const val = typeof queries[k] === 'object' ? JSON.stringify(queries[k]) : queries[k]
		return `${k}=${encodeURI(val)}`
	}).join('&');
	const str = [
		method,
		domain,
		path,
		query
	].join("\n");
	const hmac = crypto.createHmac('sha256', setting.ncmb.clientKey);
  return hmac.update(str).digest('base64');
}

export { routing };