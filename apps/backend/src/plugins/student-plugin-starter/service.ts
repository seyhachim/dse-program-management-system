import type {
  StudentPluginStarterQuery,
  StudentPluginStarterWelcome,
} from "@dse-pms/shared-types";

/**
 * Deliberately stateless. No academic records, Prisma access, notifications,
 * network activity or cross-plugin writes. Students may extend it in a fork.
 */
export const studentPluginStarterService = {
  welcome(input: StudentPluginStarterQuery): StudentPluginStarterWelcome {
    return {
      programmeId: input.programmeId,
      title: "Student Plugin Starter",
      message: "Fictional training example. No PMS academic data was accessed.",
    };
  },
};

export type StudentPluginStarterService = typeof studentPluginStarterService;
