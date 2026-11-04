export const MORGAN_FORMAT = `:method :url :response-time [:status] \n`;
export const AUTH_TIMER_MEMBER = 6;
export const AUTH_TIMER_TABLE = 0.5;
/** Afitsant (umumiy PIN) sessiyasi, soatda — bitta smena */
export const AUTH_TIMER_WAITER = 14;

import mongoose from "mongoose";
export const shapeIntoMongooseObjectId = (target: any) => {
  return typeof target === "string"
    ? new mongoose.Types.ObjectId(target)
    : target;
};
