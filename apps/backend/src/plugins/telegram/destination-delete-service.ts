import type { AuthUser } from "../../core/auth/token.ts";
import { hasRoleInProgramme } from "../../core/auth/token.ts";
import { prisma } from "../../core/db/prisma.ts";
import { TelegramDestinationError } from "./destination-service.ts";

type DeletableDestinationRow = {
  id: string;
  programmeId: string;
  status: string;
  chatId: string | null;
  verifiedAt: Date | null;
};

export function canHardDeleteTelegramDestination(input: {
  status: string;
  chatId: string | null;
  verifiedAt: Date | null;
  deliveryCount: number;
}): boolean {
  return (
    input.status === "PENDING" &&
    input.chatId === null &&
    input.verifiedAt === null &&
    input.deliveryCount === 0
  );
}

function assertProgrammeManager(user: AuthUser, programmeId: string) {
  if (
    !hasRoleInProgramme(user, "admin", programmeId) &&
    !hasRoleInProgramme(user, "program_coordinator", programmeId)
  ) {
    throw new TelegramDestinationError(
      "FORBIDDEN",
      "Telegram destination management is limited to programme managers",
    );
  }
}

export const telegramDestinationDeleteService = {
  async deleteUnusedPending(user: AuthUser, destinationId: string) {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<DeletableDestinationRow[]>`
        SELECT "id","programmeId","status","chatId","verifiedAt"
        FROM "telegram_security"."TelegramDestination"
        WHERE "id"=${destinationId}
        FOR UPDATE
      `;
      const destination = rows[0];
      if (!destination) {
        throw new TelegramDestinationError("NOT_FOUND", "Telegram destination not found");
      }

      assertProgrammeManager(user, destination.programmeId);

      const deliveries = await tx.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS "count"
        FROM "telegram_security"."TelegramDestinationDelivery"
        WHERE "destinationId"=${destinationId}
      `;
      const deliveryCount = Number(deliveries[0]?.count ?? 0n);

      if (
        !canHardDeleteTelegramDestination({
          status: destination.status,
          chatId: destination.chatId,
          verifiedAt: destination.verifiedAt,
          deliveryCount,
        })
      ) {
        throw new TelegramDestinationError(
          "CONFLICT",
          "Only never-connected pending destinations without delivery history can be deleted. Disable established destinations to preserve audit history.",
        );
      }

      const deleted = await tx.$executeRaw`
        DELETE FROM "telegram_security"."TelegramDestination"
        WHERE "id"=${destinationId}
          AND "status"='PENDING'
          AND "chatId" IS NULL
          AND "verifiedAt" IS NULL
      `;
      if (deleted !== 1) {
        throw new TelegramDestinationError(
          "CONFLICT",
          "Destination changed while it was being deleted. Refresh and try again.",
        );
      }

      return { id: destinationId, deleted: true as const };
    });
  },
};
