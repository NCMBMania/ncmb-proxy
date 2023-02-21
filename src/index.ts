import express from 'express';
import { routing } from './routes';
import bodyParser from 'body-parser';
let base: express.Express = express()
import expressWs from 'express-ws';
const { app, getWss } = expressWs(base);
import passport from 'passport';
import session from 'express-session';
import cookieParser from 'cookie-parser';

app.use(session({
    secret: 'secret-key',
    resave: true,
    saveUninitialized: true
}));
app.use(cookieParser());
app.use(passport.initialize());
app.use(passport.session());
app.set("view engine", "ejs");
app.use(express.json());
// app.use(express.raw());
app.use(bodyParser.raw({
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
app.use(express.urlencoded({ extended: true }));
routing(app, getWss());

app.listen(process.env.PORT || 3000, () => {
	console.log("Start on port 3000.")
});

