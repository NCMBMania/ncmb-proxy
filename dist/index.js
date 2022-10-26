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
app.use(express_1.default.json());
// app.use(express.raw());
app.use(body_parser_1.default.raw({
    inflate: true,
    limit: '200kb',
    type: 'multipart/form-data'
}));
(0, routes_1.routing)(app, getWss());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "*");
    res.header("Access-Control-Allow-Headers", "*");
    next();
});
app.listen(process.env.PORT || 3000, () => {
    console.log("Start on port 3000.");
});
