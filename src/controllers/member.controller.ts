import {
  ExtendedRequest,
  LoginInput,
  MemberInput,
  MemberUpdateInput,
} from "../libs/types/member";
import { T } from "../libs/types/common";
import { NextFunction, Request, Response } from "express";
import Errors, { HttpCode, Message } from "../libs/Errors";
import MemberService from "../models/Member.service";
import AuthService from "../models/Auth.service";
import { secondsUntilSessionReset } from "../libs/utils/sessionExpiry";
import TableService from "../models/Table.service";

const tableService = new TableService();
const memberService = new MemberService();
const authService = new AuthService();

const memberController: T = {};

memberController.getRestaurant = async (req: Request, res: Response) => {
  try {
    console.log("getRestaurant");
    const result = await memberService.getRestaurant();

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getRestaurant:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

memberController.signup = async (req: Request, res: Response) => {
  try {
    console.log("signup");
    const newMember: MemberInput = req.body,
      result = await memberService.signup(newMember),
      token = await authService.createToken(result);

    res.cookie("accessToken", token, {
      maxAge: secondsUntilSessionReset() * 1000,
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
      domain: ".navruz.food",
    });

    // Token javobda ham: IP (http) orqali cookie saqlanmagani uchun admin uni header bilan yuboradi
    res.status(HttpCode.CREATED).json({ member: result, accessToken: token });
  } catch (err) {
    console.log("Error, signup:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** Parolni taxmin qilishdan himoya: IP bo'yicha 10 daqiqada 10 ta xato */
const LOGIN_MAX_FAILS = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const loginFails = new Map<string, { count: number; first: number }>();

memberController.login = async (req: Request, res: Response) => {
  const ip = req.ip || "unknown";
  try {
    console.log("login");
    const now = Date.now();
    const rec = loginFails.get(ip);
    if (rec && now - rec.first > LOGIN_WINDOW_MS) loginFails.delete(ip);
    if ((loginFails.get(ip)?.count ?? 0) >= LOGIN_MAX_FAILS)
      throw new Errors(HttpCode.TOO_MANY_REQUESTS, Message.TOO_MANY_ATTEMPTS);

    const input: LoginInput = req.body;
    let result;
    try {
      result = await memberService.login(input);
    } catch (loginErr) {
      const cur = loginFails.get(ip);
      loginFails.set(ip, { count: (cur?.count ?? 0) + 1, first: cur?.first ?? now });
      throw loginErr;
    }
    loginFails.delete(ip);
    const token = await authService.createToken(result);

    res.cookie("accessToken", token, {
      maxAge: secondsUntilSessionReset() * 1000,
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
      domain: ".navruz.food",
    });

    res.status(HttpCode.OK).json({ member: result, accessToken: token });
  } catch (err) {
    console.log("Error, login:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

memberController.logout = (req: ExtendedRequest, res: Response) => {
  try {
    console.log("logout");
    res.cookie("accessToken", "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/",
      domain: ".navruz.food",
    });
    res.status(HttpCode.OK).json({ logout: true });
  } catch (err) {
    console.log("Error, logout:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

memberController.getMemberDetail = async (
  req: ExtendedRequest,
  res: Response
) => {
  try {
    console.log("getMemberDetail");
    const result = await memberService.getMemberDetail(req.member);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getMemberDetail:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

memberController.updateMember = async (req: ExtendedRequest, res: Response) => {
  try {
    console.log("updateMember");
    const input: MemberUpdateInput = req.body;
    if (req.file) input.memberImage = req.file.path.replace(/\\/g, "/");
    const result = await memberService.updateMember(req.member, input);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, updateMember:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

memberController.getTopUsers = async (req: Request, res: Response) => {
  try {
    console.log("getTopUsers");
    const result = await memberService.getTopUsers();

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getTopUsers:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

memberController.verifyAuth = async (
  req: ExtendedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const memberToken = req.cookies["accessToken"];
    const tableToken = req.cookies["tableToken"];
    if (memberToken) req.member = await authService.checkAuth(memberToken);
    if (tableToken) req.table = await authService.checkTableAuth(tableToken);
    const table = await tableService.verifyActivite(
      req.table?.activeIdentifier
    );
    if (!memberToken && !table)
      throw new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);
    next();
  } catch (err) {
    console.log("Error, verifyAuth:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

memberController.verifyMember = async (
  req: ExtendedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies["accessToken"];
    if (token) req.member = await authService.checkAuth(token);

    if (!req.member)
      throw new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);

    next();
  } catch (err) {
    console.log("Error, verifyAuth:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

memberController.retrieveAuth = async (
  req: ExtendedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const memberToken = req.cookies["accessToken"];
    const tableToken = req.cookies["tableToken"];
    if (memberToken) req.member = await authService.checkAuth(memberToken);
    if (tableToken) req.table = await authService.checkTableAuth(tableToken);
    next();
  } catch (err) {
    console.log("Error, retrieveAuth:", err);
    next();
  }
};

export default memberController;
