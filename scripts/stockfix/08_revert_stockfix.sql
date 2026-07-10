/* ============================================================================
   REVERT (only if the 2026-07-10 stockfix must be undone)
   ----------------------------------------------------------------------------
   Restores currentstock/balancestock in both stock tables to their exact
   pre-repair values from the full-table backups taken immediately before the
   fix was executed on 2026-07-10:

       WMS_ITEM_STOCK_MASTER_COMMON_CONTR_BKUP_20260710_PRE_STOCKFIX (35,051 rows)
       WMS_ITEM_STOCK_MASTER_BKUP_20260710_PRE_STOCKFIX              (32,655 rows)

   To also restore the ORIGINAL (buggy) stored procedures, run each file in
   original_sps_backup_20260710/ after dropping the fixed version:
       DROP PROCEDURE [dbo].[<name>];  then execute <name>.original.sql
   (Definitions were captured with OBJECT_DEFINITION right before deployment.)

   NOTE: reverting re-introduces the drift and the bugs. Any vouchers entered
   AFTER the fix was deployed were posted with correct arithmetic; reverting
   the data (pre-fix snapshot) discards their effect on the two columns until
   the next reconcile. Prefer re-running 07_repair_currentstock.sql (or
   USP_WMS_RECONCILE_FULL_STOCK) over a data revert unless the fix itself is
   suspected to be wrong.
   ============================================================================ */
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @RC INT;

BEGIN TRY
    BEGIN TRAN;

    UPDATE S
    SET S.CURRENTSTOCK = B.CURRENTSTOCK,
        S.BALANCESTOCK = B.BALANCESTOCK
    FROM WMS_ITEM_STOCK_MASTER_COMMON_CONTR S
    INNER JOIN WMS_ITEM_STOCK_MASTER_COMMON_CONTR_BKUP_20260710_PRE_STOCKFIX B
            ON B.pk_ItemstkId = S.pk_ItemstkId
    WHERE ISNULL(S.CURRENTSTOCK,0) <> ISNULL(B.CURRENTSTOCK,0)
       OR ISNULL(S.BALANCESTOCK,0) <> ISNULL(B.BALANCESTOCK,0);
    SET @RC = @@ROWCOUNT; PRINT 'COMMON_CONTR rows reverted: ' + CONVERT(VARCHAR(12), @RC);

    UPDATE M
    SET M.CURRENTSTOCK = B.CURRENTSTOCK,
        M.BALANCESTOCK = B.BALANCESTOCK
    FROM WMS_ITEM_STOCK_MASTER M
    INNER JOIN WMS_ITEM_STOCK_MASTER_BKUP_20260710_PRE_STOCKFIX B
            ON B.pk_ItemStockId = M.pk_ItemStockId
    WHERE ISNULL(M.CURRENTSTOCK,0) <> ISNULL(B.CURRENTSTOCK,0)
       OR ISNULL(M.BALANCESTOCK,0) <> ISNULL(B.BALANCESTOCK,0);
    SET @RC = @@ROWCOUNT; PRINT 'ITEM_STOCK_MASTER rows reverted: ' + CONVERT(VARCHAR(12), @RC);

    COMMIT TRAN;
    PRINT 'REVERT COMMITTED';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRAN;
    PRINT 'REVERT FAILED, ROLLED BACK: ' + ERROR_MESSAGE();
END CATCH
