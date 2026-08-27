[Uploading CLEANUP_DETAILS.md…]()
[Uploading CLEANUP_DETAILS.md…]()
# Repository Cleanup - Files Removed

This PR removes the following unused/legacy files from the repository:

## Files Deleted

### 1. **AGENTS.md**
- **Reason**: Minimal documentation containing only an external link to Expo v54.0.0 docs
- **Size**: 118 bytes
- **Impact**: None - reference material readily available online

### 2. **CLAUDE.md**
- **Reason**: Redundant file that only contains a reference to AGENTS.md (@AGENTS.md)
- **Size**: 11 bytes
- **Impact**: None - no functional code depends on this

### 3. **check_kotlin.sh**
- **Reason**: Orphaned Kotlin validation script incompatible with current TypeScript/Expo project
- **Size**: 1085 bytes
- **Impact**: None - this is a React Native/Expo app, not a Kotlin project
- **Details**: Script checks Kotlin syntax which is not used in this codebase

### 4. **db.js**
- **Reason**: Unused database initialization file (better-sqlite3 dependency not in package.json)
- **Size**: 547 bytes
- **Impact**: None - not imported anywhere in the project
- **Details**: Creates a transactions table but never used in app structure

### 5. **server.js**
- **Reason**: Unused Express server file incompatible with Expo app architecture
- **Size**: 966 bytes
- **Impact**: None - Expo apps are client-side only, server routes in routes/ folder don't exist
- **Details**: References routes that don't exist in current project (stk push, callbacks, transactions)

## Summary

Total files removed: **5**
Total bytes freed: **2,727 bytes**

These were legacy artifacts from earlier development phases and don't align with the current Expo React Native project structure.

## Verification

After this cleanup:
- ✅ TypeScript configuration intact
- ✅ Package.json dependencies unchanged
- ✅ All app directories (app/, components/, services/, etc.) remain intact
- ✅ ESLint and build configurations preserved
