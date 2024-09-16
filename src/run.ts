import path from 'node:path'
import execa from 'execa'
import { loadEnv, Plugin } from 'vite'
import makeDebugger from 'debug'
import c from 'picocolors'
import { toArray } from '@antfu/utils'
import { minimatch } from 'minimatch'
import type { Options, ResolvedRunOptions, Runner, RunnerHandlerParameters } from './types'

const PLUGIN_NAME = 'vite:plugin:run'
const throttles: Set<string> = new Set()
const debug = {
	default: makeDebugger(PLUGIN_NAME),
	runner: (name: string, ...debug: [any]) => makeDebugger(`${PLUGIN_NAME}:${name.replaceAll(' ', ':')}`)(...debug),
}

function warn(prefix: string, message: string) {
	process.stdout.write(c.bold(`${c.yellow(`(!) ${prefix}`)} ${message}\n`))
}

/**
 * Reload when some files are changed.
 */
export function run(options: Options = []): Plugin {
	const silent = 'silent' in options
		? options.silent
		: undefined

	const skipDts = 'skipDts' in options
		? options.skipDts
		: undefined

	const resolvedOptions: ResolvedRunOptions = {
		env: {},
		silent: silent ?? true,
		skipDts: skipDts ?? true,
		build: false,
		input: toArray('input' in options
			? options.input
			: options as Runner | Runner[]),
	}

	return {
		name: PLUGIN_NAME,
		configResolved(config) {
			resolvedOptions.env = loadEnv(config.mode ?? process.env.NODE_ENV ?? 'development', process.cwd(), '')
			resolvedOptions.build = config.command === 'build'

			debug.default('Given options:', options)
			debug.default('Resolved options:', { ...resolvedOptions, env: '<hidden>' })

			resolvedOptions.input.forEach((runner) => {
				if (runner.startup !== false) {
					handleRunnerCommand(resolvedOptions, runner)
				}
			})
		},
		handleHotUpdate({ file, server }) {
			if (resolvedOptions.skipDts && file.endsWith('.d.ts')) {
				return []
			}

			handleReload(resolvedOptions, { file, server })
		},
	}
}

function canRunnerRun(runner: Runner, parameters: RunnerHandlerParameters): boolean {
	const file = parameters.file.replaceAll('\\', '/')
	const name = getRunnerName(runner)

	const patterns = !Array.isArray(runner.pattern)
		? [runner.pattern!].filter(Boolean)
		: runner.pattern.filter(Boolean)

	const conditionPass = runner.condition?.(file)
	const patternMatch = patterns.some((pattern) => {
		pattern = path.resolve(parameters.server.config.root, pattern).replaceAll('\\', '/')

		if (minimatch(file, pattern)) {
			debug.runner(name, `pattern ${pattern} matched for ${c.gray(parameters.file)}`)
			return true
		}

		return false
	})

	debug.runner(name, `Patterns ${patternMatch ? 'passed' : 'did not pass'} for ${c.gray(parameters.file)} (${patterns.map((p) => path.resolve(parameters.server.config.root, p))})`)
	debug.runner(name, `Condition ${conditionPass ? 'passed' : 'did not pass'} for ${c.gray(parameters.file)}`)

	if (!patternMatch && !conditionPass) {
		debug.runner(name, 'Neither condition or pattern passed, skipping.')
		return false
	}

	return true
}

function handleReload(options: ResolvedRunOptions, parameters: RunnerHandlerParameters) {
	options.input.forEach((runner) => {
		if (!canRunnerRun(runner, parameters)) {
			return
		}

		handleRunner(runner, options, parameters)
	})
}

function handleRunner(runner: Runner, options: ResolvedRunOptions, parameters: RunnerHandlerParameters) {
	debug.default(`${c.gray(parameters.file)} changed, applying itsss handler...`)

	try {
		if (typeof runner.onFileChanged === 'function') {
			runner.onFileChanged?.(parameters)
		}

		if (Array.isArray(runner.run)) {
			handleRunnerCommand(options, runner)
		}
	} catch (error: any) {
		warn(PLUGIN_NAME, `Handler failed for ${parameters.file}: ${error.message}`)
		debug.default('Full error:', error)
	}
}

function handleRunnerCommand(options: ResolvedRunOptions, runner: Runner) {
	if (!runner.run) {
		return
	}

	const name = getRunnerName(runner)

	if (options.build && runner.build === false) {
		debug.runner(name, 'Skipping when building.')
		return
	}

	// Check throttles
	if (throttles.has(name)) {
		debug.runner(name, 'Skipping because of throttling.')
		return
	}

	// Throttles the runner
	throttles.add(name)
	setTimeout(() => throttles.delete(name), runner.throttle ?? 500)

	// Runs the runner after the configured delay
	debug.runner(name, 'Running...')
	setTimeout(async() => {
		const { stdout, stderr, failed, exitCode } = await execa(
			getExecutable(options, getRunnerCommand(runner)),
			getRunnerArguments(runner),
			{
				stdout: options.silent ? 'ignore' : 'pipe',
				stderr: options.silent ? 'ignore' : 'pipe',
				reject: false,
			},
		)

		if (failed && !options.silent) {
			console.error(`[Vite Plugin Run] failed to run: [${name}] with code ${exitCode}`)
		}

		if (stdout && !options.silent) {
			process.stdout.write(stdout)
		}

		if (stdout && !options.silent) {
			process.stdout.write(stderr)
		}

		debug.runner(name, stdout)
		debug.runner(name, stderr)
		debug.runner(name, !failed ? 'Ran successfully.' : `Failed with code ${exitCode}.`)
	}, runner.delay ?? 50)
}

function getRunnerName(runner: Runner) {
	return runner.name?.toLowerCase() || [getRunnerCommand(runner), ...getRunnerArguments(runner)].join(' ').toLowerCase() || '<runner>'
}

function getRunnerArguments(runner: Runner): string[] {
	const args = typeof runner.run === 'function'
		? runner.run()
		: runner.run ?? []

	return args.slice(1) ?? []
}

function getRunnerCommand(runner: Runner): string | undefined {
	const args = typeof runner.run === 'function'
		? runner.run()
		: runner.run ?? []

	return args?.[0]
}

function getExecutable(options: ResolvedRunOptions, name?: string) {
	if (!name) {
		throw new Error('No executable given.')
	}

	return process.env[`${name}_PATH`] || options.env[`${name}_PATH`] || name
}
