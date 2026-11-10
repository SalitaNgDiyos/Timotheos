# Security policy

## Reporting a vulnerability

Please report security problems privately by email to **malayangbiblia@gmail.com** instead of opening a public issue.
Say which version and which device (Windows, Linux or Android) you used, what you did, and what happened. A short
description is enough; please do not include other people's private data.

You will get a reply as soon as the maintainer is able to read the message. Timotheos is maintained by one person
without a paid support team, so there is no promised response time. A fix is published as a new version of the free
software, and the reporter is credited in the release notes if they wish.

## What is covered

The current release of Timotheos, built from this repository. Timotheos works offline: it contains no online account,
no server and no tracking. It reads module files (theWord, e-Sword) that the user chooses, so reports about a crafted
module file that crashes the program or reads other files are welcome.

## Test builds

Builds named "android-test" are signed with a public test key (`.github/test-signing.jks`, published on purpose so that
test builds can update each other). They are for testing only. A release for the public must be signed with a private
key that is never published.
