import express from 'express';
import { routing } from './routes';
import bodyParser from 'body-parser';
let base: express.Express = express()
import expressWs from 'express-ws';
const { app, getWss } = expressWs(base);

app.use(express.json());
// app.use(express.raw());
app.use(bodyParser.raw({
    inflate: true,
    limit: '200kb',
    type: 'multipart/form-data'
}));
routing(app, getWss());
app.use(express.urlencoded({ extended: true }));
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "*")
    res.header("Access-Control-Allow-Headers", "*");
    next();
});

app.listen(3000, () => {
	console.log("Start on port 3000.")
});

