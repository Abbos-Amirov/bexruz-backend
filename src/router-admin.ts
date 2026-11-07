import { Router } from "express";
import adminController from "./controllers/admin.controller";
import productController from "./controllers/product.controller";
import makeUploader from "./libs/utils/uploader";
import tableController from "./controllers/table.controller";
import orderController from "./controllers/order.controller";
const routerAdmin = Router();

// Products
routerAdmin.get("/product/all", productController.getAllProducts);
// Taomlar bo'yicha sotuv statistikasi (dashboard → "Jami buyurtma qilingan ovqatlar")
routerAdmin.get("/product/sales", orderController.getProductSales);
routerAdmin.post(
  "/product/create",
  makeUploader("products").array("productImages", 5),
  productController.createNewProduct
);
routerAdmin.get(
  "/product/:id/toggle-status",
  productController.toggleProductStatus
);
routerAdmin.patch(
  "/product/:id/toggle-status",
  productController.toggleProductStatus
);
routerAdmin.post(
  "/product/:id/toggle-status",
  productController.toggleProductStatus
);
routerAdmin.post(
  "/product/:id",
  // adminController.verifyAdmin,
  makeUploader("products").array("productImages", 5),
  productController.updateChosenProduct
);
routerAdmin.get(
  "/product/all/stat",
  // adminController.verifyAdmin,
  productController.getProductsStat
);
routerAdmin.post(
  "/product/delete/:id",
  productController.deleteChosenProduct
);

// User
routerAdmin.get(
  "/user/all",
  // adminController.verifyAdmin,
  adminController.getUsers
);
routerAdmin.post(
  "/user/edit",
  // adminController.verifyAdmin,
  adminController.updateChosenUser
);

// Table
routerAdmin.get(
  "/table/all",
  // adminController.verifyAdmin,
  tableController.getAllTables
);
routerAdmin
  .post(
    "/table/create",
    // adminController.verifyAdmin,
    tableController.createNewTable
  )
  .post(
    "/table/:id",
    // adminController.verifyAdmin,
    tableController.updateChosenTable
  )
  .post(
    "/table/delete/:id",
    // adminController.verifyAdmin,
    tableController.deleteChosenTable
  );

// Notifications (bazadagi + real-time uchun)
routerAdmin.get("/notifications", adminController.getNotifications);

// Orders
routerAdmin.get(
  "/order/all",
  // adminController.verifyAdmin,
  orderController.getAllOrders
);
routerAdmin.get(
  "/orders/all/panel",
  // adminController.verifyAdmin,
  orderController.getAllOrdersPanel
);
routerAdmin.post(
  "/order/:id",
  // adminController.verifyAdmin,
  orderController.updateChosenOrder
);
routerAdmin.get(
  "/order/statis",
  // adminController.verifyAdmin,
  orderController.getOrderStatis
);
routerAdmin.get(
  "/order/table/:id/complete",
  orderController.completeTableOrders
);
routerAdmin.post(
  "/order/table/:id/complete",
  orderController.completeTableOrders
);

// routerAdmin.post(
//   "/order/table/:id/complete",
//   orderController.completeTableOrders
// );

export default routerAdmin;
