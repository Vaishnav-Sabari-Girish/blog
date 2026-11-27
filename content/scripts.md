+++
title = "Some custom scripts I use everyday"
date = 2026-11-27 

[taxonomies]
tags = ["dotfiles", "shell", "bash", "zsh", "rust-script"]
+++

I'm sure most of the people who have used the terminal must have run some command like this:

```bash
git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit --date=relative
```

Or 

```bash
curl -s https://api.github.com/repos/:owner/:repo/issues?state=open\&per_page=100 | jq -r '.[] | "\(.number)\t\(.title)\t\(.user.login)\t\(.created_at)"' | column -t -s $'\t'
```

Then they discover aliases and now they run commands like

```bash
prettylog
```

Or 

```bash
gitstats
```

Which make no sense to someone who has never used the terminal.

To create an alias, open up your `~./bashrc` (Bash [^1]) or `~/.zshrc` (Zsh [^2])

```bash
alias prettylog="git log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit --date=relative"

alias gitstats="curl -s https://api.github.com/repos/:owner/:repo/issues?state=open\&per_page=100 | jq -r '.[] | "\(.number)\t\(.title)\t\(.user.login)\t\(.created_at)"' | column -t -s $'\t'"
```

Now let's say you need to run a command which uses multiple lines or chain multiple commands together. For eg: 

```bash
make clean && make build && make test && make install
```

Or 


```bash
git add .
git commit -m "Some commit message"
git push origin main
```

Now you could run these commands sequentially and wait for the output. But once the commands keep on increasing the user may miss some commands which can be bad.

<q>Then how do you run multiple commands without missing any step ?</q>

You use scripts.

So scripts in a nutshell are basically a file containing multiple commands that need to be run. It can be a Bash script (Most common), Perl Script (Good for string manipulation), Python script (For stuff like HTTP requests) etc. But the main idea is to be able to run multiple commands without typing them one-by-one.

Custom scripts are something you'll automatically start writing once you become a terminal power user. It can be for something as simple as say creating a basic web server (If you're using `node`), you can create a script `node_server.sh` that runs the following commands so that you do not need to type them one-by-one

```bash
npm install
npm run build
npm start
```

Instead of having to run all 3 commands one-by-one (You could chain them with `&&` to run them as a one-liner too) putting it in a script makes it much more easier for someone who has never seen those commands (And for you too). All they have to do is `./node_server.sh` and a web server is spun up.

<q>Do you use custom scripts</q>

Yes I do. In fact I prefer to create a custom script for everything which can be scripted. So my `dotfiles` are pretty loaded with scripts for the most mundane of tasks too. Some of the scripts are straight-up tools.

## My Custom scripts

For my scripts I use 3 main languages `rust-script` [^3], `bash` [^1] and `zsh` [^2]

I'll be sharing the scripts which I use everyday. To find out my other scripts, take a look at my dotfiles [^4].


### One script to add, commit and push (`acp`)

![Zsh Script](https://img.shields.io/badge/Zsh-Script-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)

So normally people run these commands separately

```bash
git add .
git commit -m "Commit Message"
git push origin main
```

With `acp` it becomes a single command. It also allows for choosing what type of commit it was (Conventional Commits Syntax [^5]).

![acp](/custom_script/acp.gif)

**Link to the script: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles/src/branch/main/zsh/.zsh_functions#L51>**

<br>

### A single script to create projects for multiple languages (`mkproj`)

![Rust Script](https://img.shields.io/badge/Rust-Script-DEA584?style=for-the-badge&logo=rust&logoColor=white)

Whenever you create a new project for a language you have to setup a few things (**_cough_** C/C++ **_cough_**). It can be the build system, or some thing else.

`mkproj` allows you to create projects for multiple languages without needing to remember the command for each one. It lets you choose the language and creates a project for it.

![mkproj](/custom_script/mkproj.gif)

**Link to script: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles/src/branch/main/zsh/.local/bin/mkproj.rs>**

<br>

### Terminal based PDF manager (`pdf_manager`)

![Zsh Script](https://img.shields.io/badge/Zsh-Script-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)

Well everyone uses PDF's. And for PDF related tools, most go to websites like [ILovePDF](https://www.ilovepdf.com/) or [SmallPDF](https://smallpdf.com/). 

Now you can do the same thing in your terminal

![pdf_manager](/custom_script/pdf_manager.gif)

**Link to script: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles/src/branch/main/zsh/.local/bin/pdf_manager.zsh>**

<br>

### Send and receive files via `magic-wormhole` [^6] (`wsend` and `wreceive`)

![Bash Script](https://img.shields.io/badge/Bash-Script-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)

Ever wanted to send files from your laptop to your phone or receive files from your phone to your laptop. It is possible using the `magic-wormhole` protocol. For laptop I use the [`magic-wormhole` CLI](https://magic-wormhole.readthedocs.io/en/latest/) and for phone I use the app [Iyox Wormhole](https://github.com/iyox-studios/iyox-Wormhole). 

But the commands can be a little bit long and confusing. So there are now scripts to send and receive files. 

![wsend](/custom_script/wsend.gif)

![wreceive](/custom_script/wreceive.gif)


**Link to scripts**:
  - **`wsend`**: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles/src/branch/main/zsh/.local/bin/send_file.sh>

  - **`wreceive`**: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles/src/branch/main/zsh/.local/bin/receive_file.sh>

<br>

### Copy the tree structure of a project (`tree_copy`)


![Zsh Script](https://img.shields.io/badge/Zsh-Script-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)


So if you always wanted to copy the output of the `tree` command to a `README.md` like so :

```txt
test_mkproj
├── Cargo.toml
└── src
    └── main.rs
```

Using the `tree_copy` makes it very simple

**Link to script: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles/src/branch/main/zsh/.zsh_functions#L313>**


<br>

### Copy contents of a file without entering a file (`ccat`)


![Zsh Script](https://img.shields.io/badge/Zsh-Script-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)

So normally to copy a file, you need to open the file and copy it or, you could do this too:

```bash
cat file | wl-copy
```

The above is what this script basically does, but it works for one file. What if you have multiple files you want to copy.

That is when `ccat` comes in. You could do something like 

```bash
ccat file1 file2 file3 file4
```

And all 4 files will be copied.

**Link to script: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles/src/branch/main/zsh/.zsh_functions#L418>**

<br><br>

## Compositor level scripts I use

Some scripts I use in my `niri` workflow.

### OCR script (Image to text)

![Bash Script](https://img.shields.io/badge/Bash-Script-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)


This script allows me to select an area of the screen and extract the text from the captured screenshot

It also allows me to translate the captured language to English.

Translation is done using the `translate-shell` tool [^7] and OCR is done using the `tesseract` [^8] OCR engine.

<br>

<p align="center">
  <img src="/custom_script/ocr.gif" />
</p>

<br>

> [!WARNING]
> Currently the script translates only the following languages to English:
> - Japanese (Vertical script and normal script)
> - Chinese (Simplified and Traditional)

> [!NOTE]
> The small popup window that opens when I press the keybind is an external tool `wlr-which-key` [^9]
> It allows you to add a keybind with sub-keybinds.

> [!NOTE]
> Also the OCR idea was taken from `coko7` dotfiles [^10] (Thank you)

**Link to script: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles/src/branch/main/niri/.config/niri/scripts/ocr.sh>**

<br>

### Define a word

![Bash Script](https://img.shields.io/badge/Bash-Script-4EAA25?style=for-the-badge&logo=gnu-bash&logoColor=white)

This script let's me select a word and gives me it's definition which I can then copy and paste.

<p align="center">
  <img src="/custom_script/define.gif" />
</p>


**Link to script: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles/src/branch/main/niri/.config/niri/scripts/define.sh>**


That's most of my script I use everyday.

Thank you for reading.

<g>またね</g>

---

[^1]: <https://www.gnu.org/software/bash/>
[^2]: <https://www.zsh.org/>
[^3]: <https://github.com/fornwall/rust-script>
[^4]: <https://codeberg.org/Vaishnav-Sabari-Girish/dotfiles>
[^5]: <https://www.conventionalcommits.org/en/v1.0.0/>
[^6]: <https://github.com/magic-wormhole/magic-wormhole>
[^7]: <https://github.com/soimort/translate-shell>
[^8]: <https://tesseractocr.org/>
[^9]: <https://github.com/MaxVerevkin/wlr-which-key>
[^10]: <https://github.com/coko7/.dotfiles>
