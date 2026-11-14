/**
 * Abar Khabo: Enterprise Multi-Tenant SaaS
 * Recipe & Menu Item Ingredient Engine
 * 
 * Collections:
 * - Master Recipes: restaurants/{restaurantId}/recipes/{itemId}
 * - Outlet Overrides: restaurants/{restaurantId}/outlets/{outletId}/recipeOverrides/{itemId}
 */

import { getDb } from '../config/firebaseAdmin.js';
import { logger } from '../utils/logger.js';
import { convertUnit, areUnitsCompatible, normalizeUnit } from '../utils/unitConverter.js';

export class RecipeService {
  /**
   * Validates a recipe definition payload.
   * @param {Object} recipe 
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateRecipe(recipe) {
    const errors = [];
    if (!recipe || typeof recipe !== 'object') {
      return { valid: false, errors: ['Recipe payload must be an object'] };
    }

    if (!recipe.itemId || typeof recipe.itemId !== 'string') {
      errors.push('itemId is required and must be a string');
    }
    if (!recipe.restaurantId || typeof recipe.restaurantId !== 'string') {
      errors.push('restaurantId is required and must be a string');
    }

    if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
      errors.push('ingredients must be a non-empty array');
    } else {
      recipe.ingredients.forEach((ing, idx) => {
        if (!ing.ingredientId) {
          errors.push(`Ingredient at index ${idx} missing ingredientId`);
        }
        if (typeof ing.quantity !== 'number' || ing.quantity <= 0) {
          errors.push(`Ingredient at index ${idx} must have positive quantity`);
        }
        if (!ing.unit) {
          errors.push(`Ingredient at index ${idx} missing unit`);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Saves or updates a master recipe for a menu item.
   * @param {string} restaurantId 
   * @param {string} itemId 
   * @param {Object} recipeData 
   * @returns {Promise<Object>}
   */
  async setMasterRecipe(restaurantId, itemId, recipeData) {
    const db = getDb();
    const recipe = {
      ...recipeData,
      itemId,
      restaurantId,
      recipeVersion: Number(recipeData.recipeVersion || 1),
      servingSize: Number(recipeData.servingSize || 1),
      prepTimeMinutes: Number(recipeData.prepTimeMinutes || 15),
      ingredients: (recipeData.ingredients || []).map(ing => ({
        ingredientId: ing.ingredientId,
        name: ing.name || ing.ingredientId,
        quantity: Number(ing.quantity),
        unit: normalizeUnit(ing.unit)
      })),
      variantModifiers: recipeData.variantModifiers || {},
      addonModifiers: recipeData.addonModifiers || {},
      updatedAt: new Date().toISOString()
    };

    const validation = this.validateRecipe(recipe);
    if (!validation.valid) {
      throw new Error(`Invalid recipe: ${validation.errors.join('; ')}`);
    }

    const docRef = db.doc(`restaurants/${restaurantId}/recipes/${itemId}`);
    await docRef.set(recipe, { merge: true });

    logger.info('Master recipe saved', { restaurantId, itemId, version: recipe.recipeVersion });
    return recipe;
  }

  /**
   * Saves an outlet-specific recipe override.
   * @param {string} restaurantId 
   * @param {string} outletId 
   * @param {string} itemId 
   * @param {Object} overrideData 
   * @returns {Promise<Object>}
   */
  async setOutletRecipeOverride(restaurantId, outletId, itemId, overrideData) {
    const db = getDb();
    const override = {
      ...overrideData,
      itemId,
      restaurantId,
      outletId,
      ingredients: (overrideData.ingredients || []).map(ing => ({
        ingredientId: ing.ingredientId,
        name: ing.name || ing.ingredientId,
        quantity: Number(ing.quantity),
        unit: normalizeUnit(ing.unit)
      })),
      updatedAt: new Date().toISOString()
    };

    const docRef = db.doc(`restaurants/${restaurantId}/outlets/${outletId}/recipeOverrides/${itemId}`);
    await docRef.set(override, { merge: true });

    logger.info('Outlet recipe override saved', { restaurantId, outletId, itemId });
    return override;
  }

  /**
   * Resolves total required ingredients for an order's items based on recipes.
   * 
   * Supports:
   * - Item quantity multipliers
   * - Variant ingredient modifiers
   * - Addon ingredient modifiers
   * - Outlet overrides falling back to Master recipe
   * - Non-recipe items (safely ignored without blocking)
   * 
   * @param {string} restaurantId 
   * @param {string} outletId 
   * @param {Array<Object>} orderItems 
   * @returns {Promise<{ hasRecipes: boolean, requiredIngredients: Array<Object>, recipeSnapshots: Object }>}
   */
  async resolveOrderIngredients(restaurantId, outletId, orderItems) {
    const db = getDb();
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
      return { hasRecipes: false, requiredIngredients: [], recipeSnapshots: {} };
    }

    const ingredientAggregation = new Map(); // ingredientId -> { name, quantity, unit }
    const recipeSnapshots = {};
    let anyRecipeFound = false;

    for (const item of orderItems) {
      const itemId = item.id;
      if (!itemId) continue;

      let recipe = null;

      // 1. Check for outlet-specific recipe override first
      try {
        const overrideSnap = await db.doc(`restaurants/${restaurantId}/outlets/${outletId}/recipeOverrides/${itemId}`).get();
        if (overrideSnap.exists) {
          recipe = overrideSnap.data();
        }
      } catch (err) {
        logger.warn('Could not check outlet recipe override', { error: err.message, itemId });
      }

      // 2. Fall back to master recipe
      if (!recipe) {
        try {
          const masterSnap = await db.doc(`restaurants/${restaurantId}/recipes/${itemId}`).get();
          if (masterSnap.exists) {
            recipe = masterSnap.data();
          }
        } catch (err) {
          logger.warn('Could not check master recipe', { error: err.message, itemId });
        }
      }

      // If no recipe configured for this item, continue without recipe-based deduction
      if (!recipe || !Array.isArray(recipe.ingredients) || recipe.ingredients.length === 0) {
        continue;
      }

      anyRecipeFound = true;
      recipeSnapshots[itemId] = {
        recipeVersion: recipe.recipeVersion || 1,
        isOverride: recipe.outletId === outletId
      };

      const itemQty = Number(item.quantity || 1);

      // A. Base recipe ingredients
      for (const ing of recipe.ingredients) {
        const baseQty = Number(ing.quantity || 0) * itemQty;
        this._accumulateIngredient(ingredientAggregation, ing.ingredientId, ing.name, baseQty, ing.unit);
      }

      // B. Variant modifiers
      const variantKey = typeof item.variant === 'object' ? item.variant?.name : item.variant;
      if (variantKey && recipe.variantModifiers && recipe.variantModifiers[variantKey]) {
        const modIngredients = recipe.variantModifiers[variantKey];
        if (Array.isArray(modIngredients)) {
          for (const ing of modIngredients) {
            const modQty = Number(ing.quantity || 0) * itemQty;
            this._accumulateIngredient(ingredientAggregation, ing.ingredientId, ing.name, modQty, ing.unit);
          }
        }
      }

      // C. Addon modifiers
      const addons = Array.isArray(item.addons) ? item.addons : [];
      if (addons.length > 0 && recipe.addonModifiers) {
        for (const addon of addons) {
          const addonName = typeof addon === 'object' ? addon?.name : addon;
          if (addonName && recipe.addonModifiers[addonName]) {
            const addonIngredients = recipe.addonModifiers[addonName];
            if (Array.isArray(addonIngredients)) {
              for (const ing of addonIngredients) {
                const addQty = Number(ing.quantity || 0) * itemQty;
                this._accumulateIngredient(ingredientAggregation, ing.ingredientId, ing.name, addQty, ing.unit);
              }
            }
          }
        }
      }
    }

    const requiredIngredients = Array.from(ingredientAggregation.values());

    return {
      hasRecipes: anyRecipeFound,
      requiredIngredients,
      recipeSnapshots
    };
  }

  _accumulateIngredient(map, ingredientId, name, quantity, unit) {
    const normUnit = normalizeUnit(unit);
    if (!map.has(ingredientId)) {
      map.set(ingredientId, {
        ingredientId,
        name: name || ingredientId,
        quantity: Number(quantity),
        unit: normUnit
      });
    } else {
      const existing = map.get(ingredientId);
      if (existing.unit === normUnit) {
        existing.quantity = Number((existing.quantity + quantity).toFixed(4));
      } else if (areUnitsCompatible(existing.unit, normUnit)) {
        // Convert incoming unit to existing unit
        const converted = convertUnit(quantity, normUnit, existing.unit);
        existing.quantity = Number((existing.quantity + converted).toFixed(4));
      } else {
        // Different dimension (e.g. piece vs kg without density)
        // Store as separate key or raise error
        logger.warn('Incompatible units for same ingredient in recipe resolution', {
          ingredientId,
          existingUnit: existing.unit,
          newUnit: normUnit
        });
      }
    }
  }
}

export const recipeService = new RecipeService();
