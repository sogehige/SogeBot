## Raffle system
### Commands
`!raffle pick` - **OWNER** - pick or repick a winner of raffle

`!raffle remove` - **OWNER** - remove raffle without winner

`!raffle open ![raffle-keyword] [-min #?] [-max #?] [-for followers,subscribers?]`
- open a new raffle with selected keyword,
- -min # - minimal of tickets to join, -max # - max of tickets to join -> ticket raffle
- -for followers,subscribers - who can join raffle, if empty -> everyone

`!set raffleAnnounceInterval [minutes]` - **OWNER** - reannounce raffle interval each x minutes

`!raffle` - **VIEWER** - gets an info about raffle

`![raffle-keyword]` *or* `![raffle-keyword] <tickets>` - **VIEWER** - join a raffle *or* ticket raffle with amount of tickets