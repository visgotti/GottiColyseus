So I started off trying to just alter the colyseus code, but after a couple days of that, I realized it
was stupid and I should stop trying to fit all my edge cases into colyseus because at the end of the day
what I'm trying to build is different enough that I was wasting too much time trying to make things work
with the already existing colyseus engine. On top of that, if things change in colyseus they could break
my engine.

SO

I basically decided to start with a blank project, and from the ground up I'm going to take bits from the colyseus engine
and implement them to fit my distributed messaging engine (gotti-channels).

So far i've made decent progress. The protocols are all completely different and I'm still figuring out some kinks
for clients listening/writing to different areas. Right now you can send a request and then basically return options/true or anything
truthy for it to be success, and return something falsey for it to be rejected.

This will be ironed out as I continue to develop the API.

I plan on building this around my Gotti.js project which will be using a system message queue on both client and server side.

Therefore I'm implementing messaging protocols to fulfil the needs of remote/local/global/client/etc etc messaging to and from different systems.

