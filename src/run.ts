import { spawn } from 'node:child_process'
import path from 'node:path'
import { loadEnv, Plugin } from 'vite'
import makeDebugger from 'debug'
import c from 'picocolors'
import { toArray } from '@antfu/utils'
import { minimatch } from 'minimatch'
import type { Options, ResolvedRunOptions, Runner, RunnerHandlerParameters } from './types'

const PLUGIN_NAME = 'vite:plugin:run'
const debug = makeDebugger(PLUGIN_NAME)
const throttles: Set<string> = new Set()

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
		input: toArray('input' in options
			? options.input
			: options as Runner | Runner[]),
	}

	return {
		name: PLUGIN_NAME,
		configResolved(config) {
			resolvedOptions.env = loadEnv(config.mode ?? process.env.NODE_ENV ?? 'development', process.cwd(), '')

			debug('Given options:', options)
			debug('Resolved options:', resolvedOptions)

			resolvedOptions.input.forEach((runner) => {
				if (runner.startup !== false || runner.condition === undefined) {
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

function handleReload(options: ResolvedRunOptions, parameters: RunnerHandlerParameters) {
	const file = parameters.file.replaceAll('\\', '/')

	options.input.forEach((runner) => {
		const name = getRunnerName(runner)

		if (runner.condition && !runner.condition(file)) {
			debug(`${name} condition did not pass for ${c.gray(parameters.file)}`)
			return
		}

		const patterns = !Array.isArray(runner.pattern)
			? [runner.pattern!].filter(Boolean)
			: runner.pattern

		const patternMatch = patterns.some((pattern) => {
			pattern = path.resolve(parameters.server.config.root, pattern)

			if (minimatch(file, pattern)) {
				debug(`${name} pattern ${pattern} matched for ${c.gray(parameters.file)}`)
				return true
			}

			return false
		})

		if (!patternMatch) {
			debug(`${name} no pattern matched for ${c.gray(parameters.file)} (${patterns.map((p) => path.resolve(parameters.server.config.root, p))})`)
			return
		}

		handleRunner(runner, options, parameters)
	})
}

function handleRunner(runner: Runner, options: ResolvedRunOptions, parameters: RunnerHandlerParameters) {
	debug(`${c.gray(parameters.file)} changed, applying its handler...`)

	try {
		if (typeof runner.onFileChanged === 'function') {
			runner.onFileChanged?.(parameters)
		}

		if (Array.isArray(runner.run)) {
			handleRunnerCommand(options, runner)
		}
	} catch (error: any) {
		warn(PLUGIN_NAME, `Handler failed for ${parameters.file}: ${error.message}`)
		debug('Full error:', error)
	}
}

function handleRunnerCommand(options: ResolvedRunOptions, runner: Runner) {
	if (!runner.run) {
		return
	}

	const name = getRunnerName(runner)

	// Check throttles
	if (throttles.has(name)) {
		debug(`${name} is throttled.`)
		return
	}

	// Throttles the runner
	throttles.add(name)
	setTimeout(() => throttles.delete(name), runner.throttle ?? 500)

	// Runs the runner after the configured delay
	debug(`Running ${name}...`)
	setTimeout(() => {
		const child = spawn(
			getExecutable(options, getRunnerCommand(runner)),
			getRunnerArguments(runner),
			{ shell: true },
		)

		if (!options.silent) {
			child.stdout.on('data', (data) => {
				process.stdout.write(data.toString())
			})

			child.stderr.on('data', (data) => {
				process.stdout.write(data.toString())
			})
		}

		child.on('close', (code) => {
			const result = code === 0
				? 'ran successfully'
				: `failed with code ${code}`

			debug(`${name} ${result}`)
		})
	}, runner.delay ?? 50)
}

function getRunnerName(runner: Runner) {
	return c.bold(`[${runner.name || getRunnerCommand(runner) || '<runner>'}]`)
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
