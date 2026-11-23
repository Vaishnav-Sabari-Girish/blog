+++
title = "Why I wrote my zooming daemon in C"
date = 2026-11-23

[taxonomies]
tags = ["c", "daemon", "wayland"]
+++

When I started writing `miru` [^1]. I had a very scientific decision making process:
1. It needs to talk to Wayland
2. It should be easy to build on Linux
3. I thought, "You know what, let us do this shit in C". 


<q>Huh ? Why though ?</q>

Cause why not ?

I mean the 3rd reason carried most of the weight, but there were also some slightly more defendable reasons.

## Wayland without the middle managers

`miru` needs to interact with Wayland at a fairly low level. And the lowest-level language I knew was C. I mean you're close enough to the system, close to the protocol and close enough that you have the compiler judging your choices.

Some projects like this one `woomer` [^2] (Which is pretty cool tbh, no hate) use libraries like `raylib` (Wht ?) for this kind of work. `raylib` is a great library - it is friendly, convenient and has the energy of a helpful senior developer who says "Don't worry, I'll take care of the scary parts".

But for `miru` I wanted to work with Wayland functions directly, without adding an extra layer between me and the compositor. No wrapper deciding what I _really_ meant. No abstraction politely asking me to look at progress bars, praying that it builds without errors.

So now I have to deal with functions that look like this 

```c
zwlr_layer_surface_v1_set_anchor(
  ls->layer_surface,
  ZWLR_LAYER_SURFACE_V1_ANCHOR_TOP | ZWLR_LAYER_SURFACE_V1_ANCHOR_BOTTOM | ZWLR_LAYER_SURFACE_V1_ANCHOR_LEFT |
  ZWLR_LAYER_SURFACE_V1_ANCHOR_RIGHT
);
```

<br>

<q>Damn</q>

Yeah. I know.

## Your Linux machine already speaks C

One underrated advantage of writing something in C is that most Linux systems already have a C compiler installed (Mostly `gcc` but `clang` is also usually installed if you prefer that). So no need for extra installation steps, a package manager's extended Universe (**_cough_** `node` **_cough_**), or seventeen dependencies with names that sound like failed startup companies.

You open a terminal, run `gcc`, `cc` or `clang` and - assuming your code does not offend the compiler that day - your project builds.

C lets the project feel more like "_Clone it , build it and run it_" and not like "first, install `node`, then configure your `$PATH`, then sacrifice a goat to `npm`".

## The Honest Reason

And then there is the real reason.

I do not have a deeply philosophical justification involving memory-safety, performance benchmarks, or a carefully researched comparison of systems programming languages (**_cough_** Rust **_cough_**).

I just thought 

> Let's do this shit in C

That was it. 

And to be fair that was how most of my side projects work. I just thought _Let's write this shit in this language_. Most of the times you do not choose a language because it is optimal (Sometimes you have no choice), but because you wanna learn something. Maybe you wanted to learn that language or it's build system (`cmake` was more powerful than I thought) or just cause you decided to have a major brain fart and just write stuff in `x86` assembly (No hate to assembly devs, they're goated).

<q>Was it worth it ?</q>

Yes.

Writing `miru` in C made me learn stuff which I would not have learnt if I had written it in Rust or Python. I learnt about stuff like `asan/ubsan` [^3] [^4] for memory-safety checks , `gcc-analyzer` [^5] and `valgrind` [^6] for memory leak detection and how to rewrite GitHub Actions to Woodpecker CI [^7].


It also gave me occasional segmentation faults, especially when I added OpenGL/EGL2 shaders, which made me question my sanity and gave me moments where I stared at my screen wondering whether I had broken my computer or my mind was playing tricks on me (I got a few black screens at the initial stages of `miru`).

<q>So why C ?</q>

Because `miru` needed to work closely with Wayland.

Because Linux systems usually already have the tools to build it.

And because,  at some point, I looked at the project and thought:

> Let's do this shit in C

Sometimes, that is reason enough.

<p align="center">
  <img src="/miru/miru_logo.svg" width=300 />
</p>

<br>

<g>またね</g>

<br>

---

[^1]: <https://codeberg.org/Vaishnav-Sabari-Girish/miru> 
[^2]: <https://github.com/coffeeispower/woomer>
[^3]: <https://clang.llvm.org/docs/UndefinedBehaviorSanitizer.html>
[^4]: <https://cppcheatsheet.com/notes/debug/sanitizers.html>
[^5]: <https://gcc.gnu.org/onlinedocs/gcc/Static-Analyzer-Options.html>
[^6]: <https://valgrind.org/docs/manual/mc-manual.html>
[^7]: <https://sfconservancy.org/GiveUpGitHub/>
