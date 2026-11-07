import { Member } from "../libs/types/member";
import { AUTH_TIMER_MEMBER, AUTH_TIMER_TABLE, AUTH_TIMER_WAITER } from "../libs/config";
import jwt from "jsonwebtoken";
import Errors, { HttpCode, Message } from "../libs/Errors";
import { Table } from "../libs/types/table";
import MemberModel from "../schema/Member.model";
import { MemberStatus, MemberType } from "../libs/enums/member.enum";

class AuthService {
  private readonly secretToken;
  constructor() {
    this.secretToken = process.env.SECRET_TOKEN;
  }
  /** Member */
  public createToken(payload: Member) {
    return new Promise((resolve, reject) => {
      const duration = `${AUTH_TIMER_MEMBER}h`;
      jwt.sign(
        payload,
        process.env.SECRET_TOKEN as string,
        {
          expiresIn: duration,
        },
        (err, token) => {
          if (err)
            reject(
              new Errors(HttpCode.UNAUTHORIZED, Message.TOKEN_CREATION_FAILED)
            );
          else resolve(token as string);
        }
      );
    });
  }

  public async checkAuth(token: string): Promise<Member> {
    const result: Member = (await jwt.verify(
      token,
      this.secretToken as string
    )) as Member;
    return result;
  }
  /** Table */
  public createTableToken(payload: Table) {
    return new Promise((resolve, reject) => {
      const duration = `${AUTH_TIMER_TABLE}h`;
      jwt.sign(
        payload,
        process.env.SECRET_TOKEN as string,
        {
          expiresIn: duration,
        },
        (err, token) => {
          if (err)
            reject(
              new Errors(HttpCode.UNAUTHORIZED, Message.TOKEN_CREATION_FAILED)
            );
          else resolve(token as string);
        }
      );
    });
  }

  public async checkTableAuth(token: string): Promise<Table> {
    const result: Table = (await jwt.verify(
      token,
      this.secretToken as string
    )) as Table;
    return result;
  }

  /** Waiter (umumiy PIN bilan kirgan afitsant) */
  public createWaiterToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      jwt.sign(
        { role: "WAITER" },
        process.env.SECRET_TOKEN as string,
        { expiresIn: `${AUTH_TIMER_WAITER}h` },
        (err, token) => {
          if (err || !token)
            reject(
              new Errors(HttpCode.UNAUTHORIZED, Message.TOKEN_CREATION_FAILED)
            );
          else resolve(token);
        }
      );
    });
  }

  public checkWaiterToken(token: string): boolean {
    try {
      const payload = jwt.verify(token, this.secretToken as string) as {
        role?: string;
      };
      return payload?.role === "WAITER";
    } catch {
      return false;
    }
  }

  /**
   * Admin (RESTAURANT) tokenini tekshiradi. Bazada akkaunt bloklangan yoki
   * o'chirilgan bo'lsa, muddati tugamagan token ham rad etiladi.
   */
  public async verifyAdminToken(token?: string | null): Promise<Member | null> {
    if (!token) return null;
    try {
      const payload = jwt.verify(token, this.secretToken as string) as Member;
      if (payload?.memberType !== MemberType.RESTAURANT || !payload._id) return null;
      const member = await MemberModel.findOne({
        _id: payload._id,
        memberType: MemberType.RESTAURANT,
        memberStatus: MemberStatus.ACTIVE,
      })
        .select("_id")
        .lean()
        .exec();
      return member ? payload : null;
    } catch {
      return null;
    }
  }
}

export default AuthService;
