import { spawn } from 'node:child_process'
import { loadEnv, Plugin } from 'vite'
import makeDebugger from 'debug'
import c from 'picocolors'
import { toArray } from '@antfu/utils'
import type { Options, ResolvedRunOptions, Runner, RunnerHandlerParameters } from './types'

const PLUGIN_NAME = 'vite:plugin:run'
const debug = makeDebugger(PLUGIN_NAME)

function warn(prefix: string, message: string) {
	process.stdout.write(c.bold(`${c.yellow(`(!) ${prefix}`)} ${message}\n`))
}

// function log(prefix: string, message: string) {
// 	process.stdout.write(c.bold(`${c.cyan(`${prefix}`)} ${message}\n`))
// }

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
				if (runner.startup === true) {
					handleRunnerCommand(resolvedOptions, runner)
				}
			})
		},
		configureServer(server) {
			server.watcher
				.on('add', (path) => handleReload(resolvedOptions, { file: path, server, type: 'add' }))
				.on('change', (path) => handleReload(resolvedOptions, { file: path, server, type: 'change' }))
				.on('unlink', (path) => handleReload(resolvedOptions, { file: path, server, type: 'unlink' }))
		},
		handleHotUpdate({ file }) {
			if (resolvedOptions.skipDts && file.endsWith('.d.ts')) {
				return []
			}
		},
	}
}

function handleReload(options: ResolvedRunOptions, parameters: RunnerHandlerParameters) {
	const file = parameters.file.replaceAll('\\', '/')

	options.input.forEach((runner) => {
		if (!runner.condition(file)) {
			return
		}

		debug(`${c.gray(file)} changed, applying its handler...`)
		handleRunner(runner, options, parameters)
	})
}

function handleRunner(runner: Runner, options: ResolvedRunOptions, parameters: RunnerHandlerParameters) {
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
	debug(`Running ${name}...`)

	// Run after a delay
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
	return c.bold(`[${`${runner.name}` ?? getRunnerCommand(runner) ?? '<runner>'}]`)
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
