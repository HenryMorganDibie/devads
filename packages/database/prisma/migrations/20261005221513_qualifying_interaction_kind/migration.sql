-- Qualifying interaction kinds: which interaction in a development session
-- gave the client an opportunity to present a sponsored offer. Additive only.
-- The column is nullable and existing rows are deliberately not backfilled:
-- displays recorded before this migration have no reliable kind (the web
-- beta's developer-initiated requests and the VS Code terminal waits are not
-- distinguishable after the fact), so NULL means "recorded before kinds
-- existed". Every new row gets a kind from the server.

-- CreateEnum
CREATE TYPE "QualifyingInteractionKind" AS ENUM ('WAIT', 'DEVELOPER_INITIATED', 'OTHER');

-- AlterTable
ALTER TABLE "sponsorship_events" ADD COLUMN     "interactionKind" "QualifyingInteractionKind";
