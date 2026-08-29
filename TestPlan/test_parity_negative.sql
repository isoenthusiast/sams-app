-- Non-destructive DB-level test for the transcript/tagging negative paths.
-- Everything runs inside a transaction that is ROLLED BACK — no prod writes.
\set ON_ERROR_STOP off

BEGIN;

-- 1. Tag isolation across companies: same name, different companyId → both insert.
INSERT INTO "Tag"(id, name, "companyId", "createdAt")
  VALUES ('__parity_t1__', '__parity_test_tag__', '__PARITY_CO_A__', NOW());
INSERT INTO "Tag"(id, name, "companyId", "createdAt")
  VALUES ('__parity_t2__', '__parity_test_tag__', '__PARITY_CO_B__', NOW());

SELECT 'CROSS-COMPANY-SAME-NAME-ROWS (expect 2): ' || COUNT(*)
  FROM "Tag" WHERE name = '__parity_test_tag__';

-- 2. Same-company duplicate → unique index must reject (backs the 409).
SAVEPOINT sp_dup;
INSERT INTO "Tag"(id, name, "companyId", "createdAt")
  VALUES ('__parity_t3__', '__parity_test_tag__', '__PARITY_CO_A__', NOW());
ROLLBACK TO sp_dup;

SELECT 'POST-DUP-ATTEMPT ROWS (expect 2, unchanged): ' || COUNT(*)
  FROM "Tag" WHERE name = '__parity_test_tag__';

-- 3. Junction unique: same (kID, tagId) twice must reject.
-- (kID/tagId have no FK, so fake ids are safe and rolled back anyway.)
INSERT INTO "KnowledgebaseTag"(id, "kID", "tagId", "createdAt")
  VALUES ('__parity_kt1__', '__parity_kb__', '__parity_t1__', NOW());
SAVEPOINT sp_junc;
INSERT INTO "KnowledgebaseTag"(id, "kID", "tagId", "createdAt")
  VALUES ('__parity_kt2__', '__parity_kb__', '__parity_t1__', NOW());
ROLLBACK TO sp_junc;

SELECT 'JUNCTION UNIQUE ROWS (expect 1): ' || COUNT(*)
  FROM "KnowledgebaseTag" WHERE "kID" = '__parity_kb__';

ROLLBACK;

SELECT 'POST-ROLLBACK TAG ROWS (expect 0): ' || COUNT(*)
  FROM "Tag" WHERE name = '__parity_test_tag__';
SELECT 'POST-ROLLBACK JUNCTION ROWS (expect 0): ' || COUNT(*)
  FROM "KnowledgebaseTag" WHERE "kID" = '__parity_kb__';
