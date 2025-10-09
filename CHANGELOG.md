# Changelog

All notable changes to this project will be documented in this file.

## [0.1.6] - 2025-10-09

### Fixed
- **related() method returning empty string**: Fixed critical bug where the `related()` method was returning an empty string/array even when the model had been trained with data. The issue was caused by two problems:
  1. The method was not `async` and didn't await for `initialized` and `trained` promises
  2. Options normalization was failing when using `{limit: N}` instead of `{amount: N}`
  
  The fix ensures:
  - The method now properly awaits initialization and training completion
  - Options are normalized to handle both `amount` and `limit` parameters
  - Fallback to `predictWeightedText()` is properly triggered when needed
  
  **Before:**
  ```javascript
  await trias.related('esporte', {limit: 10})
  // Returns: '' (empty string)
  ```
  
  **After:**
  ```javascript
  await trias.related('esporte', {limit: 10})
  // Returns: 'Vôlei, Tênis, Futebol, Basquete'
  ```

### Technical Details
- Changed `related()` from sync to async method
- Added proper initialization checks matching `predict()` method pattern
- Normalized `options.amount` and `options.limit` to ensure consistent behavior
- All existing tests continue to pass

## [0.1.5] - Previous version
- (previous changes)

