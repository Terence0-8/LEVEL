import { describeCapability, browserPlatform } from '@/data/notificationService'

/** Capacité de notification du navigateur courant (lue à la demande, jamais mise en cache). */
export const describeCapabilityNow = () => describeCapability(browserPlatform)
