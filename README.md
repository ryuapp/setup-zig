# setup-zig

[![CI](https://github.com/ryuapp/setup-zig/workflows/CI/badge.svg)](https://github.com/ryuapp/setup-zig/actions/workflows/ci.yaml)
[![License](https://img.shields.io/github/license/ryuapp/setup-zig?labelColor=171717&color=39b54a&label=License)](https://github.com/ryuapp/setup-zig/blob/main/LICENSE)

Set up your GitHub Actions workflow with a specific version of Zig.

## Usage

See [action.yaml](action.yaml).

```yaml
- uses: actions/checkout@v7

# To protect against supply chain attacks,
# it is recommended to pin the actions you use to a specific hash, such as by using pinact.
# This is an example, so it is not pinned.
- uses: ryuapp/setup-zig@main
  with:
    # Zig version, latest, master, or empty to read minimum_zig_version from build.zig.zon
    version: ""

    # Restore and save the global and local Zig cache directories
    # Default: true
    cache: true

    # Additional cache key component added to the automatic OS/platform/version key.
    # Use this to differentiate matrix configurations, such as targets.
    # Default: empty
    cache-key: ""
```

### Basic

```yaml
steps:
  - uses: actions/checkout@v7

  - uses: ryuapp/setup-zig@main
    with:
      version: 0.16.0

  - run: zig version
```

## License

MIT-0
