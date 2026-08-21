import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)
// The captures are 3200px wide and get scaled down hard; a higher quality floor
// keeps the UI text from turning to mush at 1080p.
Config.setCrf(17)
