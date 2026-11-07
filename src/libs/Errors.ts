export enum HttpCode {
  OK = 200,
  CREATED = 201,
  NOT_MODIFIED = 304,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
}

export enum Message {
  SOMETHING_WENT_WRONG = "Something went wrong!",
  NO_DATA_FOUND = "No data is found!",
  CREATE_FAILED = "Create is failed!",
  UPDATE_FAILED = "Update is failed!",

  USED_NICK_PHONE = "You are inserting already used nick ore phone",
  ADMIN_EXIST="Admin account already exists. Please sign up as a User!",
  TOKEN_CREATION_FAILED = "Token creation error!",
  NO_MEMBER_NICK = "No member with that member nick",
  BLOCKED_USER = "You have been blocked, contact restaurant!",
  WRONG_PASSWORD = "Wrong password entered, please try again",
  NOT_AUTHENTICATED = "You are not authenticated, Please login first!",
  NOT_TABLE = "No table found for this QR code",
  SIGNUP_DISABLED = "Ro'yxatdan o'tish yopilgan",
  WRONG_PIN = "PIN-kod noto'g'ri",
  TOO_MANY_ATTEMPTS = "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring",
  WAITER_PIN_NOT_SET = "Afitsant PIN-kodi serverda sozlanmagan",
  DUPLICATE_PRODUCT = "Bunday mahsulot (nom + o'lcham + hajm) allaqachon mavjud",
}

class Errors extends Error {
  public code: HttpCode;
  public message: Message;

  static standard = {
    code: HttpCode.INTERNAL_SERVER_ERROR,
    message: Message.SOMETHING_WENT_WRONG,
  };

  constructor(statusCode: HttpCode, statusMessage: Message) {
    super();
    this.code = statusCode;
    this.message = statusMessage;
  }
}

export default Errors;
