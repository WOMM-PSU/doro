/**
 * Demo affordances (persona switcher, sample onboarding, reset controls and
 * demo banners) are on by default. Set NEXT_PUBLIC_DEMO_MODE=false for a
 * hosted deployment that shouldn't advertise the sample world.
 */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";
