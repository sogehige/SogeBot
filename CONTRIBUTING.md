Contributing
============

Quick Links for Contributing
----------------------------

- Our bug tracker:
  https://github.com/sogehige/sogeBot/issues

- Development Discord.gg channel:
  https://discordapp.com/invite/52KpmuH

Coding Guidelines
-----------------

- sogeBot uses JavaScript Standard Style, for more
  information, please read here:
  https://standardjs.com/

- Avoid trailing spaces.  To view trailing spaces before making a
  commit, use "git diff" on your changes.  If colors are enabled for
  git in the command prompt, it will show you any whitespace issues
  marked with red.

- No Tabs, only Spaces, Space width is 2

Commit Guidelines
-----------------

- sogeBot uses the 50/72 standard for commits.  50 characters max
  for the title (excluding module prefix), an empty line, and then a
  full description of the commit, wrapped to 72 columns max.  See this
  link for more information: http://chris.beams.io/posts/git-commit/

- Make sure commit titles are always in present tense, and are not
  followed by punctuation.

- Keep second line blank.

- Prefix commit titles with the `name`, followed by a colon and a
  space. So for example, if you are modifying the alias system:

- Commit title should be entirely in lowercase with the exception of proper
  nouns, acronyms, and the words that refer to code, like function/variable names

- If fixing issue,u se `Closes` or `Fixes` keywords in commit description to
  link with issue or idea

    `alias: fix bug with parsing`

  Or for donationalerts.ru integration:

    `donationalerts: fix source not displaying`

  If you are updating non project files like CONTRIBUTING.md, travis.yml, use `chore`

    `chore: update CONTRIBUTING.md`

  Example of full commit message:

    ```text
    subsystem: explain the commit in one line

    Body of commit message is a few lines of text, explaining things
    in more detail, possibly giving some background about the issue
    being fixed, etc.

    The body of the commit message can be several paragraphs, and
    please do proper word-wrap and keep columns shorter than about
    72 characters or so. That way, `git log` will show things
    nicely even when it is indented.

    Fixes: https://github.com/sogehige/sogeBot/issues/1406
    ```

- If you still need examples, please view the commit history.

## Additional Notes

### Commit Squashing

In most cases, do not squash commits that you add to your Pull Request during
the review process. When the commits in your Pull Request land, they may be
squashed into one commit per logical change. Metadata will be added to the
commit message (including links to the Pull Request, links to relevant issues,
and the names of the reviewers). The commit history of your Pull Request,
however, will stay intact on the Pull Request page.