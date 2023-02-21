"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const routes_1 = require("./routes");
const body_parser_1 = __importDefault(require("body-parser"));
let base = (0, express_1.default)();
const express_ws_1 = __importDefault(require("express-ws"));
const { app, getWss } = (0, express_ws_1.default)(base);
const passport_1 = __importDefault(require("passport"));
const express_session_1 = __importDefault(require("express-session"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
app.use((0, express_session_1.default)({
    secret: 'secret-key',
    resave: true,
    saveUninitialized: true
}));
app.use((0, cookie_parser_1.default)());
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
app.set("view engine", "ejs");
app.use(express_1.default.json());
// app.use(express.raw());
app.use(body_parser_1.default.raw({
    inflate: true,
    limit: '200kb',
    type: 'multipart/form-data'
}));
/*
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "*")
    res.header("Access-Control-Allow-Headers", "*");
    next();
});
*/
app.use(express_1.default.urlencoded({ extended: true }));
(0, routes_1.routing)(app, getWss());
app.listen(process.env.PORT || 3000, () => {
    console.log("Start on port 3000.");
});
