import express from 'express';
import { routing } from './routes';
import bodyParser from 'body-parser';
const app: express.Express = express()

app.use(express.json());
// app.use(express.raw());
app.use(bodyParser.raw({
    inflate: true,
    limit: '100kb',
    type: 'multipart/form-data'
}));
app.use(express.urlencoded({ extended: true }));
const router = routing(express.Router());
app.use('*', router);
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "*")
    res.header("Access-Control-Allow-Headers", "*");
    next();
});

app.listen(3000, () => {
	console.log("Start on port 3000.")
});

