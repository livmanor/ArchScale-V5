const fs = require('fs');

// Patch tests/setup/db_connection.ts
let dbConn = fs.readFileSync('tests/setup/db_connection.ts', 'utf8');
if (!dbConn.includes('022_attendance_schema_and_self_service.sql')) {
  dbConn = dbConn.replace(
    "'019_attendance_self_service.sql'",
    "'019_attendance_self_service.sql',\n        '020_platform_tenant_admin_approval_scope.sql',\n        '021_platform_rbac_management_functions.sql',\n        '022_attendance_schema_and_self_service.sql'"
  );
  fs.writeFileSync('tests/setup/db_connection.ts', dbConn, 'utf8');
  console.log('Patched tests/setup/db_connection.ts');
}

// Patch src/db/index.ts to catch idle errors on runtimePool
let dbIndex = fs.readFileSync('src/db/index.ts', 'utf8');
if (!dbIndex.includes("runtimePool.on('error'")) {
  dbIndex = dbIndex.replace(
    'export const runtimePool = createRuntimePool();',
    `export const runtimePool = createRuntimePool();\nruntimePool.on('error', (err) => {\n    console.warn('[db:runtimePool] idle client error:', err.message);\n});`
  );
  fs.writeFileSync('src/db/index.ts', dbIndex, 'utf8');
  console.log('Patched src/db/index.ts');
}
