
const Category = require("../models/categories.model");
exports.craeteCategory=async(req,res)=>{
    try{
        const category=await Category.create(req.body)
        res.status(201).json({cate:category,message:"Category created successfully",status_code:201})

    }catch(error){
        res.status(400).json({ message: error.message });
    };
    
}

exports.getAllCategory=async(req,res)=>{
    try{
        const allcategory=await Category.find()
        if(allcategory){
            res.status(200).json({categories:allcategory,message:"Category fetch successfully",status_code:200})
        }
        else{
            res.status(400).json({message:"category not found",status_code:400})
        }
    }catch(error){
        res.status(500).json({message:error.message})
    }
}

exports.getSingleCategory=async(req,res)=>{
    try{
      const{id}=req?.params
      console.log("id",id);
      
        const category=await Category.findById(id)
        if(category){
            res.status(200).json({categories:category,message:"Category fetch successfully",status_code:200})
        }
        else{
            res.status(400).json({message:"category not found",status_code:400})
        }
    }catch(error){
        res.status(500).json({message:error.message})
    }
}
exports.updateCategory=async(req,res)=>{
  try{
    const updatedCategoryData=await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedCategoryData) {
      return res.status(404).json({
        message: "Category not found",
      });
    }
    res.status(200).json({
      category: updatedCategoryData,
      message: "Category updated successfully",
      status_code:200
    });
  } catch (error) {
    res.status(400).json({
      message: "Error updating user",
      error: error.message,
    });
  } 
};
exports.deleteCategory = async (req, res) => {
  try {
    const deletedCategory = await Category.findByIdAndDelete(req.params.id);
    if (!deletedCategory) {
      return res.status(404).json({
        message: "Category not found",
      });
    }
    res.status(200).json({
      message: "Category deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Error deleting user",
      error: error.message,
    });
  }
};