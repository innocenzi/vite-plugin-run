import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
	clean: true,
	declaration: true,
	externals: [
		'rollup',
		'vite',
	],
	rollup: {
		emitCJS: true,
	},
})
