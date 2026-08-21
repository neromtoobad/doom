import { loadFont as loadDisplay } from '@remotion/google-fonts/Unbounded'
import { loadFont as loadBody } from '@remotion/google-fonts/Inter'
import { loadFont as loadMono } from '@remotion/google-fonts/SpaceMono'

// Only the weights actually used. Left unsubsetted, Inter alone fires 126
// requests per render tab and dominates the render time.
const quiet = true

export const display = loadDisplay('normal', {
  subsets: ['latin'],
  weights: ['700', '900'],
  ignoreTooManyRequestsWarning: quiet,
}).fontFamily

export const body = loadBody('normal', {
  subsets: ['latin'],
  weights: ['400', '600', '700'],
  ignoreTooManyRequestsWarning: quiet,
}).fontFamily

export const mono = loadMono('normal', {
  subsets: ['latin'],
  weights: ['400', '700'],
  ignoreTooManyRequestsWarning: quiet,
}).fontFamily
