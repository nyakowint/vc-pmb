import { Activity } from "./activity";

export type PresenceData = {
    // Only relevant types - https://github.com/PreMiD/PreMiD/blob/main/%40types/PreMiD/PresenceData.d.ts
    clientId: string;
    presenceData: Activity;
  }
