var express = require("express");
var router = express.Router();
const DButils = require("../modules/DButils");
const search_util = require("./utils/search_recipes");


//Authentication all incoming requsets
router.use(function requireLogin(req, res, next) {
    if (!req.user_id) {
        console.log('req.session in require login', req.session);
        console.log('req.user_id', req.user_id);
        next({ status: 401, message: "unauthorized" });
    } else {
        next();
    }
});

// gets the watched,saved info for a list of recipes::
router.get("/recipeInfo/:ids", async(req, res) => {
    const ids = JSON.parse(req.params.ids);
    const user_ID = req.user_id;
    const userRecipeData = await getUserInfoOnRecipes(user_ID, ids);
    res.send(userRecipeData);
});

//get params: mealId
//return: The meal_name and recipe_id for some meal_id
router.get("/myMealRecipes/:mealId", async(req, res) => {
    const user_ID = req.session.user_id;;
    const mealId = req.params.mealId;
    const result = await DButils.execQuery(
        `SELECT meals.meal_name,recipesForMeal.recipe_id 
        FROM meals JOIN recipesForMeal 
        ON meals.meal_id=recipesForMeal.meal_id
        WHERE meals.meal_id = '${mealId}'`)
    res.send(result);
});
// get params: recipeId
//Return the meal flag, if the meal should be marked for in this recipe
router.get("/getRecipesMealsFlags/:recipeId", async(req, res) => {
    try{
    const user_ID = req.session.user_id;
    const recipe_ID = req.params.recipeId;

    const meals = await DButils.execQuery(
        `SELECT meal_name,meal_id FROM meals 
        WHERE user_id = '${user_ID}'`)

    const mr = await DButils.execQuery(
        `SELECT meal_id FROM recipesForMeal 
        WHERE recipe_id = '${recipe_ID}'`)

    
    var ans = {}

    meals.forEach(meal => {
        ans[meal.meal_id] = {name : meal.meal_name, meal_id : meal.meal_id, flag : mr.includes(meal.meal_id)}
    });    

    res.send(ans);
}catch(error){
    res.send(error);
}
});

//Return the meal_name according to user_id
router.get("/myMeals", async(req, res) => {
    try{
    const user_ID = req.session.user_id;
    const meals = await DButils.execQuery(
        `SELECT meal_name,meal_id FROM meals 
        WHERE user_id = '${user_ID}'`)
    var ans = {}
    meals.forEach(meal => {
            ans[meal.meal_id] = {name : meal.meal_name, meal_id : meal.meal_id}
        }); 
    res.send(ans);
    }catch(error){
        res.send(error);
    }
});



// help function. checks in the DB.
async function getUserInfoOnRecipes(user_id, ids) {
    const userRecipesData = {};
    let is_favorite;
    let is_watched;
    var i;
    for (i = 0; i < ids.length; i++) {
        let currID = ids[i];
        //check if a favorite:
        const result = await DButils.execQuery(
            `SELECT * FROM user_favorites WHERE user_id = '${user_id}' AND recipe_id = '${currID}'`)
        if (result.length == 0) //this recipe is not in favorits.
            is_favorite = false;

        else
            is_favorite = true; // else
        //check if an watched::
        const result2 = await DButils.execQuery(
            `SELECT * FROM user_watched WHERE user_id = '${user_id}' AND recipe_id = '${currID}'`)

        if (result2.length == 0) //this recipe is not in watched.
            is_watched = false;

        else
            is_watched = true; // else

        userRecipesData[currID] = { watched: is_watched, saved: is_favorite };
        //});
    }
    return userRecipesData;
}

// adds current recipe_ID to the saved recipes table. (using the user' cookie)
router.put("/add_to_favorites/recipeId/:recipeId", async(req, res, next) => {
    try {

        const user_ID = req.session.user_id;
        const recipe_ID = req.params.recipeId;

        const recipe =
            await search_util.getRecipesInfo([recipe_ID], false)

        if (!recipe)
            throw { status: 400, message: "recipe not found" }
        const result = await DButils.execQuery(
            `SELECT * FROM user_favorites WHERE user_id = '${user_ID}' AND recipe_id = '${recipe_ID}'`)

        if (result.length == 0) { //this recipe is not in the DB already
            await DButils.execQuery( //adds it
                `INSERT INTO user_favorites VALUES ('${recipe_ID}', '${user_ID}')`
            )
        } else
            throw { status: 408, message: "recipe is already in favorites." }

        res.status(200).send({ message: "saved to your favorites recipes successfully." })
    } catch (error) {
        next(error)
    }
});

//get params: recipeId, mealId
//return : id the recipe already exist in this meal
router.put("/recipesForMeal/recipeId/:recipeId/:mealId", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id;
        const recipe_ID = req.params.recipeId;
        const meal_ID = req.params.mealId;

        //res.status(200).send({ message: "almoggg." })

        const recipe =
            await search_util.getRecipesInfo([recipe_ID], false)

        if (!recipe)
            throw { status: 400, message: "recipe not found" }
        
            const resultIfRecipeExistInMeal = await DButils.execQuery( // Verify if the user have this recipe in this meal
            `SELECT * FROM meals  
            INNER JOIN recipesForMeal 
            ON meals.meal_id=recipesForMeal.meal_id 
            WHERE user_id = '${user_ID}' 
            AND recipe_id = '${recipe_ID}' 
            AND meals.meal_id= '${meal_ID}'`)
        
            const resultIfUserHaveMeal = await DButils.execQuery(
            `SELECT meal_id FROM meals WHERE user_id = '${user_ID}'`) //Verify if the user have meals 

        if (resultIfUserHaveMeal.length == 0) 
        { //this recipe is not in the meal of this user_id.
            throw { status: 408, message: "you don't have any meal" }
        }
        else if (resultIfUserHaveMeal.length > 0 & resultIfRecipeExistInMeal.length==0)
        {
            await DButils.execQuery( //adds recipe to meal
                `INSERT INTO recipesForMeal VALUES ('${meal_ID}','${recipe_ID}')`)
            
            res.status(200).send({ message: "saved to your next meal successfully." })
        }
        else if( resultIfUserHaveMeal.length>0 & !(resultIfRecipeExistInMeal==0))
        {
            throw { status: 408, message: "recipe is already in this meal." }
        }
    } catch (error) {
        next(error)
    }                           
});

router.put("/add_new_recipe", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id;
        const result = await DButils.execQuery("SELECT details FROM MyRecipes");
        result.forEach(async(det) => {
            if (det.find((x) => x.recipe_name.equals(req.body.recipeName))){
                next(error)
                throw { status: 409, message: "You already have a recipe name with that name, please choose a different one" };
            }
        });
        const username = await DButils.execQuery(
            `SELECT username FROM users WHERE user_id='${user_ID}'`
        );
        var username_object = username.map(function(username){
            return username['username'];
        });
        await DButils.execQuery(
            `INSERT INTO MyRecipes(user_id,recipe_id)VALUES('${user_ID}',default)`
        );
        const recipe_id = await DButils.execQuery(
            `SELECT recipe_id FROM MyRecipes WHERE details is null`
        );
        var recipe_id_object = recipe_id.map(function(recipe_id){
            return recipe_id['recipe_id'];
        });

        var instruction = new Object();
        instruction.step= "1";
        instruction.instruction= req.body.instruction;

        var ingredients = new Object();
        ingredients.name= req.body.ingredients;
        ingredients.amount= null;

        var recipe = new Object();
        recipe.recipe_id= recipe_id_object[0];
        recipe.author_username= username_object[0];
        recipe.recipe_name= req.body.recipeName;
        recipe.image= req.body.image;
        recipe.ready_in_minutes= req.body.ready_in_minutes;
        recipe.amount_of_servings= req.body.serving;
        recipe.ingredients= ingredients;
        recipe.instructions= instruction;

        var recipeString = JSON.stringify(recipe);

        await DButils.execQuery(
            `UPDATE MyRecipes set details='${recipeString}' WHERE recipe_id='${recipe_id}'`
        );
        res.status(201).send({ message: recipeString, success: true });
        //res.status(201).send({ message: "recipe was added Successfully", success: true });
    } catch (error) {
        next(error);
    }
});

router.put("/creat_meal/:mealName", async(req, res, next) =>
{
    try{
        const user_ID = req.session.user_id;
        const mealName = req.params.mealName;
        const max_mealId = await DButils.execQuery( 
            `SELECT max(meal_id) FROM meals`)
        
        await DButils.execQuery(
            `INSERT INTO meals VALUES (default, '${mealName}', '${user_ID}')`)

        res.status(200).send(max_mealId+1)
    }catch (error) {
        res.status(502).send(error)
    }

}
)

// adds current recipe_ID to the watched recipes table. (using the user' cookie)
router.put("/add_to_watched/recipeId/:recipeId", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id;
        const recipe_ID = req.params.recipeId;
        const recipe =
            await search_util.getRecipesInfo([recipe_ID], false)
        if (!recipe)
            throw { status: 400, message: "recipe not found" }
        const result = await DButils.execQuery(
            `SELECT * FROM user_watched WHERE user_id = '${user_ID}' AND recipe_id = '${recipe_ID}'`)
        if (result.length == 0) { //this recipe is not in the DB already
            await DButils.execQuery( //adds it
                `INSERT INTO user_watched VALUES ('${recipe_ID}', '${user_ID}', default)`
            )
        } else // recipe is already exist in watched table.
            await DButils.execQuery( //update its datetime
            `UPDATE user_watched SET insert_time = default WHERE user_id = '${user_ID}' AND recipe_id = '${recipe_ID}'`)
        res.status(200).send({ message: "added to your watched recipes successfully." })
    } catch (error) {
        next(error)
    }
});


// returns all personal recipes of the user. (3)
router.get("/my_recipes", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id
        const my_recipes =
            await DButils.execQuery(
                `SELECT details FROM MyRecipes WHERE user_id = '${user_ID}'`)
        if (my_recipes.length == 0)
            throw { status: 405, message: "the user does not have any personal recipes to display." }
        let recipesArray = []
        my_recipes_preview =
            my_recipes.map((recipe) => {
                let recipeTestDetails = JSON.parse(recipe.details);
                recipesArray.push(recipeTestDetails);
            })

        res.status(200).send(recipesArray)
    } catch (error) {
        next(error)
    }
});


// returns the user's personal recipe with the specific ID.
router.get("/my_recipes/recipeId/:recipeId", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id
        const recipe_ID = req.params.recipeId;
        const recipe =
            await DButils.execQuery(
                `SELECT details FROM MyRecipes WHERE user_id = '${user_ID}' and 
                recipe_id = '${recipe_ID}'`)
        if (recipe.length < 1) {
            throw { status: 400, message: "recipe not found" }
        }
        let recipeTestDetails = JSON.parse(recipe[0].details);
        res.status(200).send(recipeTestDetails)
    } catch (error) {
        next(error)
    }
});


// returns fullview of all personal recipes of the user. (6)
router.get("/fullview/my_recipes", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id
        const my_recipes =
            await DButils.execQuery(
                `SELECT details FROM MyRecipes WHERE user_id = '${user_ID}'`)
        let recipesArray = []
        my_recipes_preview =
            my_recipes.map((recipe) => {
                let recipeTestDetails = JSON.parse(recipe.details);
                var dictionary = {};
                const {
                    recipe_name,
                    ready_in_minutes,
                    likes,
                    vegan,
                    vegetarian,
                    gluten_free,
                    image,
                    instructions,
                    servings,
                    ingredients,
                } = recipeTestDetails[0];
                var content = {
                    recipe_name: recipe_name,
                    ready_in_minutes: ready_in_minutes,
                    likes: likes,
                    vegan: vegan,
                    vegetarian: vegetarian,
                    gluten_free: gluten_free,
                    image: image,
                    instructions: instructions,
                    servings: servings,
                    ingredients: ingredients,
                }
                var recipe_id = recipeTestDetails[0].recipe_id;
                dictionary[recipe_id] = new Object();
                dictionary[recipe_id] = content;
                recipesArray.push(dictionary);
            })
        res.status(200).send(recipesArray)
    } catch (error) {
        next(error)
    }
});

// returns fullview of the specific personal recipes of the user. (6)
router.get("/fullview/my_recipes/recipeId/:recipeId", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id
        const recipe_ID = req.params.recipeId;
        const recipe =
            await DButils.execQuery(
                `SELECT details FROM MyRecipes WHERE user_id = '${user_ID}' and 
                recipe_id = '${recipe_ID}'`)
        if (recipe.length < 1) {
            throw { status: 400, message: "recipe not found" }
        }
        let recipeTestDetails = JSON.parse(recipe[0].details);
        var dictionary = {};
        const {
            recipe_name,
            ready_in_minutes,
            likes,
            vegan,
            vegetarian,
            gluten_free,
            image,
            instructions,
            amount_of_servings,
            ingredients,
        } = recipeTestDetails[0];
        var content = {
            recipe_name: recipe_name,
            ready_in_minutes: ready_in_minutes,
            likes: likes,
            vegan: vegan,
            vegetarian: vegetarian,
            gluten_free: gluten_free,
            image: image,
            instructions: instructions,
            amount_of_servings: amount_of_servings,
            ingredients: ingredients,
        }
        var recipe_id = recipeTestDetails[0].recipe_id;
        dictionary[recipe_id] = new Object();
        dictionary[recipe_id] = content;
        res.status(200).send(dictionary)
    } catch (error) {
        next(error)
    }
});

// returns preview of all personal recipes of the user. (6)
router.get("/preview/my_recipes", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id
        const my_recipes =
            await DButils.execQuery(
                `SELECT details FROM MyRecipes WHERE user_id = '${user_ID}'`)
        let recipesArray = []
        my_recipes_preview =
            my_recipes.map((recipe) => {
                let recipeTestDetails = JSON.parse(recipe.details);
                var dictionary = {};
                const {
                    recipe_name,
                    ready_in_minutes,
                    likes,
                    vegan,
                    vegetarian,
                    gluten_free,
                    image,
                } = recipeTestDetails[0];
                var content = {
                    recipe_name: recipe_name,
                    ready_in_minutes: ready_in_minutes,
                    likes: likes,
                    vegan: vegan,
                    vegetarian: vegetarian,
                    gluten_free: gluten_free,
                    image: image,
                }
                var recipe_id = recipeTestDetails[0].recipe_id;
                dictionary[recipe_id] = new Object();
                dictionary[recipe_id] = content;
                recipesArray.push(dictionary);
            })

        res.status(200).send(recipesArray)
    } catch (error) {
        next(error)
    }
});


// returns fullview of all favorites recipes of the user from the API spooncular!.
router.get("/fullview/my_favorites", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id
        const my_recipes_ids =
            await DButils.execQuery(
                `SELECT recipe_id FROM user_favorites WHERE user_id = '${user_ID}'`)
        if (my_recipes_ids && my_recipes_ids.length > 0) {
            const my_recipes_list = []
            my_recipes_ids.forEach(recipeId => {
                my_recipes_list.push(recipeId.recipe_id);
            });
            search_util.getRecipesInfo(my_recipes_list, false)
                .then((info_array) => res.send(info_array))
                .catch((error) => {
                    res.sendStatus(error.response.status);
                });
        } else {
            throw { status: 404, message: "my_favorites recipes not found" }
        }
    } catch (error) {
        next(error)
    }
});

//Return the recipe_Id accroding to user_id
router.get("/preview/myMeals/:meal_id", async(req, res) => {
    const user_ID = req.session.user_id
    const meal_ID = req.params.meal_id;
    // const result = await DButils.execQuery(
    //     `SELECT meal_id, meal_name FROM meals WHERE user_id = '${user_ID}'`)
    
    //     var ans = {};
    //     result.forEach(async(element) => {
        
    const recipes_ids = 
        await DButils.execQuery(
            `select recipe_id from recipesForMeal
            join meals 
            on meals.meal_id = recipesForMeal.meal_id 
            where meals.user_id = '${user_ID}' and meals.meal_id = '${meal_ID}'`)
    
        if (recipes_ids && recipes_ids.length > 0) {
            const my_recipes_list = []
            recipes_ids.forEach(recipeId => {
                my_recipes_list.push(recipeId.recipe_id);
            });
            search_util.getRecipesInfo(my_recipes_list, true)
                .then((info_array) => res.send(info_array))
                .catch((error) => {
                    res.sendStatus(error.response.status);
                });
        }
    
        //ans[element.meal_name] = {meal_name: element.meal_name, list:my_recipes_list};    
    //});
    //res.send(ans);
});


// returns preview of all favorites recipes of the user from the API spooncular!.
router.get("/preview/my_favorites", async(req, res, next) => {
    try {
        const user_ID = req.session.user_id
        const my_recipes_ids =
            await DButils.execQuery(
                `SELECT recipe_id FROM user_favorites WHERE user_id = '${user_ID}'`)
        if (my_recipes_ids && my_recipes_ids.length > 0) {
            const my_recipes_list = []
            my_recipes_ids.forEach(recipeId => {
                my_recipes_list.push(recipeId.recipe_id);
            });
            search_util.getRecipesInfo(my_recipes_list, true)
                .then((info_array) => res.send(info_array))
                .catch((error) => {
                    res.sendStatus(error.response.status);
                });
        }
    } catch (error) {
        next(error)
    }
});

// returns 3 last watched recipes of the user from the API spooncular!.
router.get("/my_last_watched", async(req, res, next) => {
    try {

        const user_ID = req.session.user_id
        console.log('req.session.user_id', req.session.user_id);
        const my_recipes_ids =
            await DButils.execQuery(
                `SELECT TOP 3 recipe_id FROM user_watched WHERE user_id = '${user_ID}' ORDER BY insert_time DESC`)
        if (my_recipes_ids && my_recipes_ids.length > 0) {

            const my_recipes_list = []

            my_recipes_ids.forEach(recipeId => {
                my_recipes_list.push(recipeId.recipe_id);
            });
            search_util.getRecipesInfo(my_recipes_list, true)
                .then((info_array) => res.send(info_array))
                .catch((error) => {
                    console.log('getRecipesInfo response error!!: ', error);
                    res.sendStatus(error.response.status);
                });
        } else
            throw { status: 403, message: "you haven't watched any recipe yet. There is nothing to display." }


    } catch (error) {
        console.log('my last watched error: ', error);
        res.send(error)
    }
});

module.exports = router;
