MIT License

Copyright (c) 2024 ibelick

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## Integration scope

Motion Primitives by ibelick: https://github.com/ibelick/motion-primitives

The creator studio adapts In View, Transition Panel, Text Effect and Animated Group appearance patterns through `components/creator/motion-primitives.tsx` and `lib/creator/motion-presets.ts`. The [Progressive Blur component](https://github.com/ibelick/motion-primitives/blob/main/components/core/progressive-blur.tsx) supplies the layered, gradient-masked blur approach adapted in `lib/creator/video-progressive-blur.ts`. The canvas version processes only a downsampled caption strip, reuses three surfaces, and samples its entrance on the caption clock instead of mounting DOM backdrop filters. Canvas equivalents use explicit timestamps rather than a DOM animation clock. Existing native shimmer, rolling numbers, border beams and highlights retain their single canvas owners. See `creator-animation-adapters.md` for the component mapping and intentional differences.
