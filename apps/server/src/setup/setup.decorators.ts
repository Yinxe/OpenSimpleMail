import { SetMetadata } from '@nestjs/common'

export const SETUP_ALLOWED_KEY = 'osm:setupAllowed'

/** Routes that must remain reachable before the first-run setup is complete. */
export const SetupAllowed = () => SetMetadata(SETUP_ALLOWED_KEY, true)
