/**
 * Exit codes.
 *
 * The CLI is driven by scripts and coding agents as much as by people, and
 * "something went wrong" (1) does not tell a caller whether to fix its
 * arguments, re-authenticate, or treat a record as absent. Every non-zero exit
 * should carry one of these.
 *
 * 0  success
 * 1  generic runtime/API failure
 * 2  usage error — bad flag, missing argument, unknown command
 * 3  auth error — missing or unusable credentials
 * 4  not found — the requested record or resource does not exist
 * 5  aborted — a confirmation prompt was declined or could not be answered
 */
export const EXIT = Object.freeze({
  OK: 0,
  ERROR: 1,
  USAGE: 2,
  AUTH: 3,
  NOT_FOUND: 4,
  ABORTED: 5
});
