const express = require("express");
const {
  craeteCategory,
  getAllCategory,
  updateCategory,
  deleteCategory
} = require("../controllers/category.controller");
const {protect, adminOnly}=require('../middlewares/auth.middleware')
const router = express.Router();

router.post("/create-category",protect,adminOnly, craeteCategory);
router.get("/getAllCategory",protect,getAllCategory);
router.put("/updateCategory/:id", protect,adminOnly,updateCategory);
router.delete("/deleteCategory/:id", protect,adminOnly,deleteCategory);

module.exports = router;
