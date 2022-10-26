import { Request, Response, Router, Express } from "express";
import YAML from 'yaml';
import fs from 'fs';
import crypto from 'crypto';
import axios, { AxiosError } from 'axios';
import multer from "multer";
import express from "express-ws";
import WebSocket, { Server } from "ws";
import { channel } from "diagnostics_channel";

const str = fs.readFileSync('./setting.yaml');
const setting = YAML.parse(str.toString());
let websocket: WebSocket | null = null;
const connections: Map<string, WebSocket[]> = new Map;

const routing = (router: express.Application, wss: Server) => {
	const request = async (req: Request, res: Response) => {
		const time = new Date().toISOString();
		const baseUrl = req.originalUrl.replace(/\?.*/, '');
		const domain = baseUrl.indexOf(setting.ncmb.version) === 1 ? setting.ncmb.domain : setting.ncmb.script.domain;
		const signature = createSignature(req.method, domain, time, baseUrl, req.query);
		const headers: {[key: string]: string} = {
			[setting.ncmb.headers.applicationKey]: setting.ncmb.applicationKey,
			[setting.ncmb.headers.timestamp]: time,
			[setting.ncmb.headers.signature]: signature,
		};
		headers["Content-Type"] = req.headers["content-type"]!;
		if (req.headers[setting.ncmb.headers.session]) {
			headers[setting.ncmb.headers.session] = req.headers[setting.ncmb.headers.session] as string;
		}
		try {
			// ファイルストアへのGETリクエストであれば、レスポンスはArrayBufferで返す
			const reg = new RegExp(`^/${setting.ncmb.version}/files/`);
			const responseType = req.method.toUpperCase() == 'GET' && reg.test(req.baseUrl) ? 'arraybuffer' : 'json';
			const response = await axios({
				url: `https://${domain}${baseUrl}`,
				method: req.method,
				headers: headers,
				params: req.query,
				data: req.body,
				responseType,
			});
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