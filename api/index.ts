import express, { type Request, type Response } from "express";
import app from "../artifacts/api-server/src/app";

export default function handler(req: Request, res: Response) {
  return app(req, res);
}
