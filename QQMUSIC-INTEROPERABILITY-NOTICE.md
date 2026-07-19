# QQ Music interoperability notice

The QQ Music importer is an unofficial, local interoperability feature. It is
intended only for a user who runs the official QQ Music client, uses their own
account, has lawful access to the selected recordings, and keeps converted
resources for personal, non-commercial use on the same computer.

The open-source license of a conversion library permits redistribution of that
library's code. It does **not** grant any right to QQ Music's software,
services, recordings, lyrics, artwork, account data, encryption scheme, or
trademarks. A project notice or user consent also cannot override applicable
law, a service agreement, or a right holder's terms.

Before enabling or distributing this feature, users and maintainers are
responsible for checking the current QQ Music and Tencent Music Entertainment
agreements and the law that applies to them. Do not use the importer to:

- access another person's account or session;
- obtain content that the current account is not entitled to play or download;
- bypass payment, geographic, account, or subscription restrictions;
- publish, share, sell, upload, or commit converted recordings, lyrics, or
  artwork;
- modify, redistribute, or impersonate the QQ Music client.

The importer binds to localhost, reads session information only while an
authorized local import is running, clears the in-memory cookie and account
identifier afterward, and does not persist cookies or ekeys. Generated private
resources and `QQMusicCache` remain excluded from Git.

This notice is provided for transparency and is not legal advice.
