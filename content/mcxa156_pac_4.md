+++
title = "Working on the NXP FRDM-MCXA156 PAC: Day 4"
date = 2026-06-08

[taxonomies]
tags = ["rust", "embedded", "pac", "nxp"]
+++

We're on <g><strong>Day 4</strong></g> (Nice)

So we interfaced a button successfully in [Day 3](@/mcxa156_pac_3.md). So right now we have inputs and outputs. 

Well guess what ? The NXP FRDM-MCXA156 has 2 buttons. 

So we'll be _scaling up_. Day 4's goal is to read _multiple GPIO inputs_ (User SW2 and SW3) and map their combinatorial states to the 3 onboard LED's (Refer [Day 2](@/mcxa156_pac_2.md) for multiple LED interfacing). 

<q>Huh. That sounds kinda useful. And it's just another button anyway, the code from Day 3 can be copied and pasted right ?</q>

Dude, you've been through this. It always does not work that way. 

Anyway, so today's lesson was a masterclass in why making assumptions about hardware architecture - and failing to double-check bitwise operations - is bad. 

<br>

## Hardware Context: Dual Buttons and RGB

A quick look at the Zephyr DeviceTree (`dts`) gives us our pin assignments. We are using 2 User Switches and all 3 channels of the RGB LED.

| Item | Detail |
| ---- | ------ |
| Red LED | GPIO3 pin 12 |
| Green LED | GPIO3 pin 13 |
| Blue LED | GPIO3 pin 0 |
| User SW2 | GPIO1 pin 7 |
| User SW3 | GPIO0 pin 6 |


> [!NOTE]
> Everything in the above table is active-low

Our target logic is simply priority routing 

1. If both SW2 and SW3 are pressed -> Blue LED in ON
2. If only SW2 is pressed          -> Red LED is ON
3. If only SW3 is pressed          -> Green LED is ON
4. If no button is pressed         -> No LED is ON


<br>

## The problem 

Well this time it was not much of a problem. It was more of a copy-paste error than any big problem like I had in [Day 1](@/mcxa156_pac_1.md) to [Day 3](@/mcxa156_pac_3.md). 

<q>So what was it ?</q>

Ok, so with the clocks enabled and routed, I set up the pin multiplexing and wrote my polling loop. I copied the bit-masking logic from SW2 and pasted it for SW3. 

I flashed the board. 

<q>So did it work ?</q>

Well the code flashed without any problems. 

Except for the fact that the LED was ON. And it was Green (Again). 

<br>

<p align="center">
  <img src="https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNGZkb3AweTdmMnR4dmprNjZsM2hlemZzNDhpOGFzbGhmMDB3bnVmNiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/GxSk8xCahCYVwph2Yp/giphy.gif" alt="Ah ship, here we go again">
</p>

<br>

That's not the only thing. The LED stayed ON. 

But when I pressed SW3, the LED turned Blue, which it was supposed to do only if I press both buttons which I did not do. 

<q>So was the firmware the issue then ? Like was it causing the SW3 to be set as PRESSED in the firmware level ?</q>

Yes, when I copied the polling logic from SW2 to SW3, I changed the port but forgot to update the bit-shift mask. 

```rust 
// WRONG:
let sw2_pressed = (p.gpio1.pdir().read().bits() & (1 << 7)) == 0;
let sw3_pressed = (p.gpio0.pdir().read().bits() & (1 << 7)) == 0; 

// CORRECT:
let sw3_pressed = (p.gpio0.pdir().read().bits() & (1 << 6)) == 0;
```

<q>Ok so you changed `7` to `6`. But why exactly did this bug occur ?</q>

Well ok, the thing is that SW3 is physically wired to PORT0 Pin 6. But the code was reading PORT0 Pin 7, it was reading an unconfigured, floating pin[^1]. 

Unconfigured pins float `LOW` (`0`), so `sw3_pressed` constantly evaluated to `true`. Because according to the software, SW3 was being held down continuously, the `if/else if` logic was permanently hijacked.

- If nothing was pressed, the fallback hit `green_on = true`.

- If SW2 was pressed, `sw2_pressed && sw3_pressed` evaluated to `true`, turning on the Blue LED.

- The Red LED could never trigger because the system never saw a state where only SW2 was pressed.


# The final working code 

```rust
#![no_std]
#![no_main]

use panic_halt as _;
use cortex_m_rt::entry;


#[entry]
fn main() -> ! {
    let p = frdm_mcxa156_pac::Peripherals::take().unwrap();

    // 1. Enable Clocks
    // PORT0/GPIO0 (SW3) and PORT1/GPIO1 (SW2) are on CC1
    p.mrcc0.mrcc_glb_cc1().modify(|_, w| {
        w.port0().enabled();
        w.gpio0().enabled();
        w.port1().enabled();
        w.gpio1().enabled();
        w.port3().enabled();
        w.gpio3().enabled();
        w
    });

    // DSB
    cortex_m::asm::dsb();

    // 2. Release RESET 
    p.mrcc0.mrcc_glb_rst1().modify(|_, w| {
        w.port0().enabled();
        w.gpio0().enabled();
        w.port1().enabled();
        w.gpio1().enabled();
        w.port3().enabled();
        w.gpio3().enabled();
        w
    });

    // 3. Configure Pin Muxing & Hardware Registers 
    
    // LED (PORT3)
    p.port3.pcr12().modify(|_, w| { w.mux().mux00(); w}); // Red
    p.port3.pcr13().modify(|_, w| { w.mux().mux00(); w}); // Green
    p.port3.pcr0().modify(|_, w| { w.mux().mux00(); w});  // Blue

    // SW2 (PORT1, Pin 7)
    p.port1.pcr7().modify(|_, w| {
        w.mux().mux00();
        w.pe().set_bit();
        w.ps().set_bit();
        w.ibe().set_bit();
        w
    });

    // SW3 (PORT0, Pin 6)
    p.port0.pcr6().modify(|_, w| {
        w.mux().mux00();
        w.pe().set_bit();
        w.ps().set_bit();
        w.ibe().set_bit();
        w
    });

    // 4. Configure the Data Direction 
    // LEDs as Output (1)
    p.gpio3.pddr().modify(|_, w| {
        w.pdd12().pdd1();
        w.pdd13().pdd1();
        w.pdd0().pdd1();
        w
    });

    // Buttons as Input (0)
    p.gpio1.pddr().modify(|_, w| { w.pdd7().pdd0(); w});  // SW2
    p.gpio0.pddr().modify(|_, w| { w.pdd6().pdd0(); w});  // SW3

    // 5. Initial State 
    // All LEDs OFF
    p.gpio3.psor().write(|w| {
        w.ptso12().ptso1();
        w.ptso13().ptso1();
        w.ptso0().ptso1();
        w
    });



    loop {
        // Read Port Data Input Registers 
        // Mask the specific bits. If 0, the button is PRESSED 
        let sw2_pressed = (p.gpio1.pdir().read().bits() & (1 << 7)) == 0;
        let sw3_pressed = (p.gpio0.pdir().read().bits() & (1 << 6)) == 0;

        // Determine which LED should be ON based on priority 
        let mut red_on = false;
        let mut green_on = false;
        let mut blue_on = false;

        if sw2_pressed && sw3_pressed {
            blue_on = true;
        } else if sw2_pressed {
            red_on = true;
        } else if sw3_pressed {
            green_on = true;
        }

        if red_on {
            p.gpio3.pcor().write(|w| w.ptco12().ptco1());
        } else {
            p.gpio3.psor().write(|w| w.ptso12().ptso1());
        }

        if green_on {
            p.gpio3.pcor().write(|w| w.ptco13().ptco1());
        } else {
            p.gpio3.psor().write(|w| w.ptso13().ptso1());
        }

        if blue_on {
            p.gpio3.pcor().write(|w| w.ptco0().ptco1());
        } else {
            p.gpio3.psor().write(|w| w.ptso0().ptso1());
        }

        cortex_m::asm::delay(48_000);
    }
}
```
<br>

# Result 

{{ image_row(
left_src="frdm/day_4/all_buttons.mp4",
left_alt="All Buttons",
left_caption="All Buttons press program"
)}}

<br>

# Key Takeaways from Day 4 

1. **Beware the Copy-Paste Mask**: Copying and pasting bitwise logic is the easiest way to introduce silent bugs. Always double-check your bit shifts (`1 << X`) against the physical pin numbers.

2. **Unconfigured Pins Lie**: If you read an unconfigured pin (like I did with Pin 7 on Port 0), it will likely float low (`0`). In an active-low system, this registers as a permanent "True" button press, entirely hijacking your program's logic.

3. **State Separation is Clean**: Notice how the loop separates the reading of inputs, the evaluation of logic, and the writing of outputs into three distinct phases. This makes debugging priority logic significantly easier than nesting register writes directly inside if statements.

<br>

> [!NOTE]
> For reference, here is the repository link again: <https://github.com/Vaishnav-Sabari-Girish/frdm_mcxa156_pac>

---

<br>

<h1 align="center"><g><strong>Definitions</strong></g></h1>

<br>

[^1]: **Floating Pin**: A digital input pin that is not actively driven high or low by an external circuit or internal pull-up/pull-down resistor. Its voltage can drift randomly due to electromagnetic noise, often settling near 0V (logic low).
