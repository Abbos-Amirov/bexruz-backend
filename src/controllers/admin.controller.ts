import { T } from "../libs/types/common";
import { NextFunction, Request, Response } from "express";
import MemberService from "../models/Member.service";
import NotifService from "../models/Notif.service";
import { ExtendedRequest, UserInquiry } from "../libs/types/member";
import { MemberType } from "../libs/enums/member.enum";
import { NotifStatus } from "../libs/enums/notif.enum";
import Errors, { HttpCode, Message } from "../libs/Errors";
import AuthService from "../models/Auth.service";

const memberService = new MemberService();
const authService = new AuthService();
const notifService = new NotifService();

const adminController: T = {};

adminController.getUsers = async (req: Request, res: Response) => {
  try {
    console.log("getUsers");
    const { page, status, search, limit } = req.query;
    const inquiry: UserInquiry = {
      page: Number(page),
      limit: Number(limit),
    };
    if (status) inquiry.status = String(status);
    if (search) inquiry.search = String(search);

    const result = await memberService.getUsers(inquiry);
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getUsers:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

adminController.updateChosenUser = async (req: Request, res: Response) => {
  try {
    console.log("updateChosenUser");
    const result = await memberService.updateChosenUser(req.body);

    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, updateChosenUser:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

/** Barcha /admin/* route'lar uchun: faqat faol RESTAURANT akkaunti o'tadi */
adminController.verifyAdmin = async (
  req: ExtendedRequest,
  res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : req.cookies?.["accessToken"];
  const member = await authService.verifyAdminToken(token);
  if (!member) {
    const err = new Errors(HttpCode.UNAUTHORIZED, Message.NOT_AUTHENTICATED);
    res.status(err.code).json(err);
    return;
  }
  req.member = member;
  next();
};

adminController.getNotifications = async (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const result = await notifService.getNotifications(
      status ? (status as NotifStatus) : undefined
    );
    res.status(HttpCode.OK).json(result);
  } catch (err) {
    console.log("Error, getNotifications:", err);
    if (err instanceof Errors) res.status(err.code).json(err);
    else res.status(Errors.standard.code).json(Errors.standard);
  }
};

export default adminController;
