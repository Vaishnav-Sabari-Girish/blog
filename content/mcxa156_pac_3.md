+++
title = "Working on the NXP FRDM-MCXA156 PAC: Day 3"
date = 2026-06-07

[taxonomies]
tags = ["rust", "pac", "embedded", "nxp"]
+++

We're on <g><strong>Day 3</strong></g>. 

We're finally moving on from just blinking LED's to using something to blink the LED.

We will be using the PAC to interface and program the built-in button to toggle the LED when pressed. 

So, basically we will start with input on Day 3.

<q>So, it's a button. How hard can it be to read a `0` or `1` ?</q>

(_Famous Last Words_)

Reading a GPIO input sounds easy and trivial, but modern microcontrollers are full of power-saving features and highly configurable pin multiplexers. 

So basically today's journey involved missing enumerations, floating pins, and a silent hardware trap that left me staring at a stuck LED for far too long than I would've liked. 

<q>So you gonna tell us what happened ?</q>

Ok, before I do, let us get some context on what I worked on.

## The Hardware Context: User Button 

So when I checked the Zephyr DeviceTree (`dts`) confirms the pin assignments for the onboard User Button (`sw2`) and the Red LED we will use as our output indicator.

| Item | Detail |
| ---- | ------ |
| Red LED | GPIO3 pin 12 (Active LOW) |
| User SW2 | GPIO1 pin 7 (Active LOW) |

> [!NOTE]
> Because they're both Active LOW, writing a `0` to the LED turns it ON, and reading a `0` from the button means it is PRESSED

<br>

## Hurdle 1: The missing PAC enums 

To read the button reliably, we need to configure its pin. Specifically, we need to set it as a GPIO and enable the internal pull-up resistor so that the pin does not float when the button isn't pressed.

So, I confidently typed `p.port1.pcr7().modify(|_, w| { w.pe().enabled() })`

<q>Then, what happened ?</q>

I got yelled at.

<br>

<p align="center">
  <img src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExOTdkYTVmYXI1MmJzNXdnaW9qdDhla3F3Nm5yaHhiYnZpNWc1c3h1MCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/vLASJ6hzSBRBu/giphy.gif" alt="yelled">
</p>

<br>

I got this error message from the compiler

```bash
error: no method named enabled found for struct BitWriter<'_, Pcr7Spec, Pe>
```

<q>If `enabled()` is not the method name, then what is ?</q>

Well, the names are not exactly friendly are they ?

The SVD file provided by NXP simply does not define the friendly enumeration values (like `enabled()` or `up()`) for these bits in the Port Control Register (`PCR`). 

<q>Ok that's fine but what was the fix and what was the method ?</q>

Well, I had to fallback to the raw bit manipulation methods provided by `svd2rust`. 

```rust
p.port1.pcr7().modify(|_, w| {
  w.mux().mux00();          // Button Button 2 (sw0) (ALT0)
  w.pe().set_bit();         // Pull enable = 1
  w.ps().set_bit();         // Pull Select = 1  (UP) 
  w
});
```

It is a little less readable, but it gets the job done.

<br>

## Hurdle 2: The input buffer trap

<q>Alright so, the pull-up is enabled and the pins are configured. Should work now right ?</q>

Well, everything went will until after the flashing. The code flashed with no errors or warnings. 

<q>So did it work ?</q>

No. The red LED did turn ON. But it stayed ON. 

Plus it was never supposed to ON in the first place. It was supposed to be OFF. And the button presses did absolutely nothing.

<q>Huh ? That's weird</q>

Yes it is. 

<p align="center">
  <img src="https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3ZGxscXdveWdzMTQyczFld2c4eHJ2OHFxamt6YjNkZHg0cHVycGt0dSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/ipm1Rmoa46acw/giphy.gif" alt="weird">
</p>

<q>So why did that happen ?</q>

Well my first thought was that the button was active-high and not active-low. But when I checked the schematic, it was definitely active-low. 

**The Cause**: Modern NXP architectures (like the MCX A series) are incredibly power-conscious. By default, they physically disconnect the GPIO from the Digital Input Register (`PDIR`) to prevent leakage currents. 

Without the Digital Input buffer enabled, the `PDIR` register always reads `0`, regardless of the actual physical voltage on the pin Because the button is active-low, a constant `0` read makes the software think the button is being permanently held down. 

The edge detection[^1] logic in my code, (`if is_pressed && !was_pressed`) saw the transition from `false` to `true` on the very first loop iteration, turned the LED ON, and then never triggered again because the input never returned to `1`.

<q>Ok, so how did you finally fix it ?</q>

Well, this fix was a simple one. I just needed to enable the Digital Input Buffer (`ibe`) in the code of Pin Control Register.

```rust
w.ibe().set_bit();
```

<br>

# Full code 

Here is the full code: 

```rust
#![no_std]
#![no_main]

use cortex_m_rt::entry;
use panic_halt as _;

#[entry]
fn main() -> ! {
    let p = frdm_mcxa156_pac::Peripherals::take().unwrap();

    // 1. Enable Clocks for Port 1/GPIO1 (Button) and Port 3/GPIO3 (LED)
    p.mrcc0.mrcc_glb_cc1().modify(|_, w| {
        w.port1().enabled();
        w.gpio1().enabled();
        w
    });

    p.mrcc0.mrcc_glb_cc1().modify(|_, w| {
        w.port3().enabled();
        w.gpio3().enabled();
        w
    });

    // DSB
    cortex_m::asm::dsb();

    // Release RESET for button and led
    p.mrcc0.mrcc_glb_rst1().modify(|_, w| {
        w.port1().enabled();
        w.gpio1().enabled();
        w
    });

    p.mrcc0.mrcc_glb_rst1().modify(|_, w| {
        w.port3().enabled();
        w.gpio3().enabled();
        w
    });

    // Configure Pin Muxing
    p.port3.pcr12().modify(|_, w| {
        w.mux().mux00();
        w
    });         // Red LED

    p.port1.pcr7().modify(|_, w| {
        w.mux().mux00();   // Button SW2    (button0)
        // Optional: Enable internal pull-up
        w.pe().set_bit();   // Pullup Enable = 1
        w.ps().set_bit();   // Pull select = 1 (Up)
        w.ibe().set_bit();  // Digital Input buffer Enabled
        w
    });

    // Configure data direction 
    p.gpio3.pddr().modify(|_, w| {
        w.pdd12().pdd1();       // Output (1)
        w
    });

    p.gpio1.pddr().modify(|_, w| {
        w.pdd7().pdd0();       // Input (0)
        w
    });

    // Initial state: turn LED OFF
    p.gpio3.psor().write(|w| w.ptso12().ptso1());

    let mut was_pressed = false;


    loop {
        // Read Port 1 Data Input Register (PDIR)
        // Masking the 7th bit. If it equals 0, the active-low button is pressed
        let is_pressed = (p.gpio1.pdir().read().bits() & (1 << 7)) == 0;

        // Detect falling edge (Pressed)
        if is_pressed && !was_pressed {
            // Toggle the RED LED
            p.gpio3.ptor().write(|w| w.ptto12().ptto1());
        }

        was_pressed = is_pressed;

        cortex_m::asm::delay(96_000);
    }
}
```

<br>

> [!NOTE]
> Port 1 (Button) and Port 3 (LED) live on `CC1`/`RST1`


<br>

# Result 

<br>

{{ image_row(
left_src="frdm/day_3/button.mp4",
left_alt="Button",
left_caption="Button Press"
) }}

<br>

# Key Takeaways from Day 3 

1. **Beware the Input Buffer**: If a GPIO input always reads `0` no matter what you do physically, check if the MCU requires the digital input buffer to be explicitly enabled. On the MCXA156, `ibe` is mandatory for inputs.

2. **SVD Files Aren't Perfect**: When `svd2rust` fails to generate friendly enum names, don't panic. Fall back to `.set_bit()` and `.clear_bit()` while referencing the reference manual.

3. **Know Your Clock Domains**: Not all ports share the same clock and reset registers. But in this case both the button and the LED share the same clock. On this board, `PORT1` and `PORT3` are on `GLB_CC1` Copy-pasting initialization code without checking the register maps will lead to hard faults. 

4. **Don't Forget to Debounce[^2]**: Physical buttons bounce. A single press might register as dozens of rapid high/low transitions. The `cortex_m::asm::delay(96_000)` acting as a small block at the end of the loop provides a rudimentary software debounce.

<br>

> [!IMPORTANT]
> Stay tuned for Day 4

> [!NOTE]
> For reference, here is the repository link again: <https://github.com/Vaishnav-Sabari-Girish/frdm_mcxa156_pac>

<br>

<h1 align="center"><g><strong>Definitions</strong></g></h1>

[^1]: **Edge Detection**: A programming logic pattern (if is_pressed && !was_pressed) that triggers an action only on the exact moment a signal transitions from one state to another (e.g., from unpressed to pressed), rather than triggering continuously while the button is held down.
[^2]: **Debouncing**: The practice of filtering out the rapid, erratic electrical noise generated when physical metal contacts inside a mechanical switch bounce against each other during a press.


