<p align="center">
<h2 align="center">Runner plugin for Vite</h2>

<p align="center">
	<a href="https://github.com/innocenzi/vite-plugin-run/releases"><img alt="version" src="https://img.shields.io/github/v/release/innocenzi/vite-plugin-run?include_prereleases&label=version&logo=github&logoColor=white"></a>
	<br />
	<br />
	<p align="center">
		A plugin for running commands when files change or when Vite starts.
	</p>
	<pre><div align="center">npm i -D vite-plugin-run</div></pre>
</p>

&nbsp;

## Usage

Install `vite-plugin-run` and add it to your Vite configuration:

```ts
import { run } from 'vite-plugin-run'

export default defineConfig({
  plugins: [
    laravel(),
      vue(),
      run([
        {
          name: 'typescript transform',
          run: ['php', 'artisan', 'typescript:transform'],
          pattern: ['app/**/*Data.php', 'app/**/Enums/**/*.php'],
        },
        {
          name: 'build routes',
          run: ['php', 'artisan', 'routes:generate'],
          condition: (file) => file.includes('/routes/'),
        }
      ]),
  ],
})
```

You can either use a `pattern` or a `condition` to specify how the files changes should be detected.

When a file in your project changes, its path will be given as an argument to `condition`. If the function returns `true`, a shell command described by `run` will be executed.

&nbsp;

## Plugin options


| Option    | Type       | Description                                             | Default |
| --------- | ---------- | ------------------------------------------------------- | ------- |
| `silent`  | `bool`     | Whether to hide the commands output in the console      | `true`  |
| `skipDts` | `bool`     | Whether to skip HMR reloads when a `.d.ts` file changes | `true`  |
| `input`   | `Runner[]` | List of runners                                         | `[]`    |

Optionally, you can directly pass a runner or a list of runner to the plugin options.

&nbsp;

## Runner options

| Option          | Type                           | Description                                                                | Default |
| --------------- | ------------------------------ | -------------------------------------------------------------------------- | ------- |
| `startup`       | `bool`                         | Whether the command should run when Vite starts                            | `true`  |
| `build`         | `bool`                         | Whether the command should run when Vite builds                            | `true`  |
| `name`          | `string`                       | An identifier for the runner, used in logs                                 |         |
| `condition`     | `() => boolean`                | A function that should return true for a file change to execute the runner |         |
| `pattern`       | `string` or `string[]`         | A minimatch pattern which files must match                                 |         |
| `run`           | `() => string[]` or `string[]` | A command executed when a file changed and the condition matches           |         |
| `onFileChanged` | `() =>void`                    | A callback executed when a file changed and the condition matches          |         |
| `delay`         | `number`                       | Delay before the command is executed                                       | `50`    |
| `throttle`      | `number`                       | Delay before the command can be re-executed                                | `50`    |

<p align="center">
	<br />
	<br />
	·
	<br />
	<br />
	<sub>Built with ❤︎ by <a href="https://twitter.com/enzoinnocenzi">Enzo Innocenzi</a>
</p>
