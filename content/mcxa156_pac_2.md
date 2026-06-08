+++
title = "Working on the NXP FRDM-MCXA156 PAC: Day 2"
date = 2026-06-06

[taxonomies]
tags = ["rust", "pac", "embedded", "nxp"]
+++

So we're on <g><strong>Day 2</strong></g> (Nice).

In [Day 1](@/mcxa156_pac_1.md), we successfully generated a custom PAC and defeated the AHB bus write-reordering to get a single green LED to blink. 

Well, guess what!! The NXP FRDM-MCXA156 has 3 LED's: 
- Red
- Green
- Blue

So in Day 2, we will be doing the following 
1. Blink each LED separately
2. Blink all 3 LED's sequentially
3. Mix 2 LED's to create a different color.


<q>Well I mean, you wasted all your time in configuring the Green LED in Day 1 right ? Then the code should be same for all 3 with some pin and register changes</q>

Well to be honest, yes and no.

Now to get some context, I got the port and pin for each LED from the output of the Zephyr DeviceTree 

| LED COLOR | PORT | PIN |
| -------------- | --------------- | --------------- |
| RED | 3 | 13 |
| GREEN | 3 | 12 |
| BLUE | 3 | 0 |

<br>

## Hurdle 1: The toolchain betrayal

Now that I got the pin numbers, I wrote 3 separate programs for the blue, red and green LED's, and to test it I ran `cargo run --example red --release` (For Red LED).

<q>Well... Did it work ?</q>

Well the program flashed successfully and the LED started blinking.

Except...it was Green.

<br>

{{ img(src="frdm/day_2/what.gif" alt="dafuq ?") }}

<br>

I checked the code, I checked everything. Everything pointed to pin 12 (Red). This time I erased the chip and flashed it again. 

Still Green.

<br>

{{ img(src="frdm/day_1/wry.gif" alt="WRYYY") }}

<br>

<q>Did you fry the channels of the Red and Blue LED's</q>

That was my first though yes. But Nope.

Turns out, my code never made it to the flash memory in the first place.


<q>Huh ? What do you mean ?</q>

In [Day 1](@/mcxa156_pac_1.md), I used the `JLinkExe` in a custom `flash.sh` script to bypass the ROM bootloader. `JLinkExe` has a `loadfile` command that _theoretically_ parses the ELF[^1] binaries. However, it does not understand the specific ELF variant produced by Rust + LLD[^2].


Instead of throwing a hard error, J-Link printed a warning "_File is if unknown/unsupported format_" and silently skipped the flashing step, leaving the previous flashed code perfectly intact.

<q>So what did you do ?</q>

A partial refactor of the `flash.sh` script.

I modified it to explicitly strip the ELF into a raw binary using `arm-none-eabi-objcopy` before passing it to `loadbin`


```bash
#!/bin/bash
ELF="$1"
BIN=$(mktemp /tmp/flash_XXXXXX.bin)
arm-none-eabi-objcopy -O binary "$ELF" "$BIN"   # <---- This line
SCRIPT=$(mktemp)
cat > "$SCRIPT" <<EOF
device MCXA156
si SWD
speed 1000
connect
r
h
loadbin $BIN 0x0
SetPC 0x800
g
qc
EOF
JLinkExe -NoGui 1 -CommanderScript "$SCRIPT"
rm -f "$BIN" "$SCRIPT"
```

> [!TIP]
> Sometimes you just need to nuke the flash from orbit to ensure you are starting fresh. Here is a handy one-liner to erase the chip via J-Link.
```bash
printf 'device MCXA156\nsi SWD\nspeed 1000\nconnect\nr\nh\nerase\nqc\n' | JLinkExe -NoGui 1
```

So here are the results

{{ image_row(
left_src="frdm/day_2/red.mp4",
left_alt="red blink",
left_caption="Red LED Blinking",

right_src="frdm/day_2/green.mp4",
right_alt="green blink",
right_caption="Green LED Blinking"
) }}


{{ image_row(
left_src="frdm/day_2/blue.mp4",
left_alt="blue blink",
left_caption="Blue LED Blinking",

right_src="",
right_alt="",
right_caption=""
) }}

<br>

## Hurdle 2 : The Compiler betrayal

<q>Now that the flashing part is fixed, it should have worked. Right ?</q>

Well that is what I thought too. 

The compiler then proceeded to have a psychotic break at my expense. 

<br>

<p align="center">
  <img src="https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3MHc0cnBmdGRvZ3Z3MDc0Ymhub3o0bjdma2RxYWs1YXdmcXhxN2N3MSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/V7QhDCsyoVoy32el9x/giphy.gif" alt="PSYCHH">
</p>

<br>

So the plan was to blink all 3 LED's (Red, Green and Blue) sequentially. 

In the GPIO peripheral, you control the output state using 3 main registers 
- **`PCOR` (Port Clear Output)**: Write `1` to clear the bit (LED ON).
- **`PSOR` (Port Set Output)**: Write `1` to set the bit (LED OFF).
- **`PTOR` (Port Toggle Output)**: Write `1` to invert the bit.

For a strict sequence, I wanted absolute control, so I wrote a loop using `PCOR` and `PSOR` with delays in between.

<q>Let me guess, another bus failure</q>

Worse. A silent logic failure. The LED turned ON and stayed ON. It never turned OFF.

I checked the disassembly. The LLVM[^3] optimizer had looked at my loop:

`PCOR(bit) -> delay -> PSOR(bit) -> delay -> (loop back to PCOR)`

LLVM determined that setting and clearing the same bit across loop iterations was redundant. It didn't understand that the `PSOR` write had a visible, real-world side effect (The LED turning OFF). So, it completely deleted the `PSOR` write from the compiled binary.

<q>So, how was it fixed ?</q>


## Fix : Compiler Fences

To force the compiler to respect my writes, I had to insert `compiler_fence(Ordering::SeqCst)` between the register accesses. This tells LLVM **_Do not reorder or eliminate memory operations across this line_**.

This is the final working code:

```rust
#![no_std]
#![no_main]

use core::sync::atomic::compiler_fence;
use core::sync::atomic::Ordering;
use cortex_m_rt::entry;
use panic_halt as _;

#[entry]
fn main() -> ! {
    let p = frdm_mcxa156_pac::Peripherals::take().unwrap();

    // 1. Enable Clocks
    p.mrcc0.mrcc_glb_cc1().modify(|_, w| {
        w.port3().enabled();
        w.gpio3().enabled();
        w
    });
    cortex_m::asm::dsb();

    // 2. Release Reset
    p.mrcc0.mrcc_glb_rst1().modify(|_, w| {
        w.port3().enabled();
        w.gpio3().enabled();
        w
    });

    // 3. Pin Mux (GPIO)
    p.port3.pcr0() .modify(|_, w| { w.mux().mux00(); w });  // Blue
    p.port3.pcr12().modify(|_, w| { w.mux().mux00(); w });  // Red
    p.port3.pcr13().modify(|_, w| { w.mux().mux00(); w });  // Green

    // 4. Direction (output)
    p.gpio3.pddr().modify(|_, w| {
        w.pdd0().pdd1();
        w.pdd12().pdd1();
        w.pdd13().pdd1();
        w
    });

    // 5. Start with all LEDs OFF (active-low: 1 = OFF)
    p.gpio3.psor().write(|w| w.ptso0().ptso1());
    compiler_fence(Ordering::SeqCst);
    p.gpio3.psor().write(|w| w.ptso12().ptso1());
    compiler_fence(Ordering::SeqCst);
    p.gpio3.psor().write(|w| w.ptso13().ptso1());
    compiler_fence(Ordering::SeqCst);

    let d = 96_000_000 / 2;

    loop {
        // Red ON → delay → Red OFF
        p.gpio3.pcor().write(|w| w.ptco12().ptco1());
        compiler_fence(Ordering::SeqCst);
        cortex_m::asm::delay(d);
        p.gpio3.psor().write(|w| w.ptso12().ptso1());
        compiler_fence(Ordering::SeqCst);

        // Green ON → delay → Green OFF
        p.gpio3.pcor().write(|w| w.ptco13().ptco1());
        compiler_fence(Ordering::SeqCst);
        cortex_m::asm::delay(d);
        p.gpio3.psor().write(|w| w.ptso13().ptso1());
        compiler_fence(Ordering::SeqCst);

        // Blue ON → delay → Blue OFF
        p.gpio3.pcor().write(|w| w.ptco0().ptco1());
        compiler_fence(Ordering::SeqCst);
        cortex_m::asm::delay(d);
        p.gpio3.psor().write(|w| w.ptso0().ptso1());
        compiler_fence(Ordering::SeqCst);
    }
}
```

<br>

This is the final result

<br>

{{ image_row(left_src="frdm/day_2/blinky.mp4", left_alt="Blinky", left_caption="Normal Blinky") }}

<br>

The next program was to mix the LED's and give the colors of Cyan, Magenta and Yellow. 

<br>

<q>Mixing colors ? How did you even do that ?</q>

## Color Mixing: Toggling using `PTOR`

<br>

The solution was to use the `PTOR` (Port Toggle) Register. 

<q>Why us PTOR ? Why not the same way as before but turn ON 2 LED's</q>

The compiler cannot optimize away a toggle because the outcome entirely depends on the current state of the hardware pin, which LLVM cannot statically determine at compile time i.e when compiling, LLVM will not know the current state of the pin.

<br>

```rust
#![no_std]
#![no_main]

use core::sync::atomic::compiler_fence;
use core::sync::atomic::Ordering;
use cortex_m_rt::entry;
use panic_halt as _;

#[entry]
fn main() -> ! {
    let p = frdm_mcxa156_pac::Peripherals::take().unwrap();

    // 1. Enable Clocks
    p.mrcc0.mrcc_glb_cc1().modify(|_, w| {
        w.port3().enabled();
        w.gpio3().enabled();
        w
    });
    cortex_m::asm::dsb();

    // 2. Release Reset
    p.mrcc0.mrcc_glb_rst1().modify(|_, w| {
        w.port3().enabled();
        w.gpio3().enabled();
        w
    });

    // 3. Pin Mux (GPIO)
    p.port3.pcr0() .modify(|_, w| { w.mux().mux00(); w });  // Blue
    p.port3.pcr12().modify(|_, w| { w.mux().mux00(); w });  // Red
    p.port3.pcr13().modify(|_, w| { w.mux().mux00(); w });  // Green

    // 4. Direction (output)
    p.gpio3.pddr().modify(|_, w| {
        w.pdd0().pdd1();
        w.pdd12().pdd1();
        w.pdd13().pdd1();
        w
    });

    // 5. Start with all LEDs OFF (active-low: 1 = OFF)
    p.gpio3.psor().write(|w| w.ptso0().ptso1());
    compiler_fence(Ordering::SeqCst);
    p.gpio3.psor().write(|w| w.ptso12().ptso1());
    compiler_fence(Ordering::SeqCst);
    p.gpio3.psor().write(|w| w.ptso13().ptso1());
    compiler_fence(Ordering::SeqCst);

    let delay_cycles = 96_000_000 / 2;

    loop {
        // Red toggle x 2 (on then off)
        p.gpio3.ptor().write(|w| w.ptto12().ptto1());
        cortex_m::asm::delay(delay_cycles);
        p.gpio3.ptor().write(|w| w.ptto12().ptto1());

        // Green toggle x 2
        p.gpio3.ptor().write(|w| w.ptto13().ptto1());
        cortex_m::asm::delay(delay_cycles);
        p.gpio3.ptor().write(|w| w.ptto13().ptto1());

        // Blue toggle x 2
        p.gpio3.ptor().write(|w| w.ptto0().ptto1());
        cortex_m::asm::delay(delay_cycles);
        p.gpio3.ptor().write(|w| w.ptto0().ptto1());
    }
}
```

<br>

This is the final result

<br>

{{ image_row(left_src="frdm/day_2/blinky_mix.mp4", left_alt="Blinky Mixed", left_caption="Mixed Blinky") }}

<br>

This is the final sequence produced by the overlapping toggles 

> [!IMPORTANT]
> The LED's are active-low, which means ON (`1`) means the LED is OFF

<br>

| Step | R | G | B |
| --------------- | --------------- | --------------- | --------------- |
| Start | ON | ON | ON |
| R Toggle | OFF | ON | ON |
| R Toggle | ON | ON| ON |
| G Toggle | ON| OFF | ON |
| G Toggle | ON| ON | ON |
| B Toggle | ON| ON | OFF |
| B Toggle | ON| ON | ON |


<br>

# Key Takeaways 

To wrap up: 
1. **Verify your flash tool**: `JLinkExe` silently failed to flash my ELF. Always check `mem32 0x00000000` to confirm the vector table is actually updated.
2. **`PTOR` is usually better than `PCOR/PSOR` for Toggling**: Port toggle is immune to aggressive LLM optimizations because each write depends on the previous pin's physical state.

<br>

> [!NOTE]
> This was a very long blog with a lot of code. Thank you for reading till the end. 


> [!NOTE]
> For reference, here is the repository link again: <https://github.com/Vaishnav-Sabari-Girish/frdm_mcxa156_pac>

---

<br>

<h1 align="center"><g><strong>Definitions</strong></g></h1>

<br>

[^1]: **ELF File (Executable and Linkable Format)**: The standard file format for object files and executables. Rust compiles down to ELF, but different linkers produce different variations that some flash tools struggle to parse.
[^2]: **LLD (LLVM Linker)**: The high-performance linker built by the LLVM project. In embedded Rust, the compiler uses LLD to stitch all your compiled object files and dependencies together into the final ELF binary.
[^3]: **LLVM (Low-Level Virtual Machine)**: The compiler backend used by `rustc` It is incredibly aggressive at optimizing code, which is great for performance but dangerous when dealing with memory-mapped hardware registers.
