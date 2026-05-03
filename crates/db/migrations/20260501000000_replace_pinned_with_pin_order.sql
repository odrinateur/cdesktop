-- Replace `pinned` boolean with `pin_order` integer for ordered pinned workspaces.
-- pin_order IS NULL means unpinned; pin_order is a sequential 0..N for currently pinned rows.

ALTER TABLE workspaces ADD COLUMN pin_order INTEGER;

-- Backfill: assign sequential pin_order to currently pinned workspaces, ordered by updated_at desc
-- so the most-recently-touched pinned workspace lands at position 0 (top of the list).
UPDATE workspaces
SET pin_order = sub.rn - 1
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY updated_at DESC) AS rn
    FROM workspaces
    WHERE pinned = 1
) sub
WHERE workspaces.id = sub.id;

ALTER TABLE workspaces DROP COLUMN pinned;
