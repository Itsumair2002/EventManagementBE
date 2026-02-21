const express = require("express");
const {
  craeteCategory,
  getAllCategory,
  updateCategory,
  deleteCategory,
  getSingleCategory
} = require("../controllers/category.controller");
const {protect, adminOnly}=require('../middlewares/auth.middleware')
const router = express.Router();

router.post("/create-category",protect,adminOnly, craeteCategory);
router.get("/getAllCategory",protect,getAllCategory);
router.get("/get-singlecategory/:id",protect,getSingleCategory)
router.put("/updateCategory/:id", protect,adminOnly,updateCategory);
router.delete("/deleteCategory/:id", protect,adminOnly,deleteCategory);

module.exports = router;
