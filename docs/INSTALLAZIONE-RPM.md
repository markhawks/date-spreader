# Installazione del pacchetto RPM (RHEL 10.3+ e Fedora 44+)

Versione inglese: [INSTALL-RPM.md](INSTALL-RPM.md). Altri modi di installare: [INSTALLAZIONE.md](INSTALLAZIONE.md).

Il pacchetto usa il **Python e le librerie del sistema** (niente librerie incluse):
- **Red Hat Enterprise Linux 10.3 o successive**, con il repository **EPEL** (da lì arrivano alcune librerie python3-*);
- **Fedora 44 o successive**: tutto arriva dai repository di Fedora.

Scarica il pacchetto del tuo sistema dalla [pagina della release](https://github.com/markhawks/date-spreader/releases/latest)
su GitHub: `datespreader-VERSIONE-RELEASE.el10.noarch.rpm` (RHEL) oppure `…fc44.noarch.rpm` (Fedora), insieme a
`SHA256SUMS`, e verificalo. Per esempio la versione 0.27.0 per RHEL:
```
V=0.27.0; B=https://github.com/markhawks/date-spreader/releases/download/v$V
curl -LO $B/datespreader-$V-1.el10.noarch.rpm -LO $B/SHA256SUMS
sha256sum -c SHA256SUMS --ignore-missing          # deve rispondere "OK"
```

## Installare

Solo su RHEL, una volta: abilita EPEL (e CodeReady Builder, come consiglia la documentazione di EPEL).
```
sudo subscription-manager repos --enable codeready-builder-for-rhel-10-$(arch)-rpms
sudo dnf install https://dl.fedoraproject.org/pub/epel/epel-release-latest-10.noarch.rpm
```

Poi, su entrambi i sistemi:
```
sudo dnf install ./datespreader-*.noarch.rpm
sudo datespreader init                     # crea il database
sudo datespreader users create-admin       # primo amministratore (chiede la password)
sudo systemctl enable --now datespreader datespreader-backup.timer
```
Il portale risponde su `http://127.0.0.1:8000`. Per raggiungerlo dalla rete:
1. in `/etc/datespreader/datespreader.env` imposta `HOST=0.0.0.0`, poi `sudo systemctl restart datespreader`;
2. apri la porta: `sudo firewall-cmd --permanent --add-service=datespreader && sudo firewall-cmd --reload`.

## Dove sta cosa

| Percorso | Contenuto |
|---|---|
| `/usr/lib/datespreader` | codice e interfaccia web (sostituiti a ogni aggiornamento) |
| `/etc/datespreader/datespreader.env` | configurazione (conservata dagli aggiornamenti) |
| `/var/lib/datespreader` | database; backup in `/var/lib/datespreader/backups` |
| `/usr/bin/datespreader` | comando di amministrazione (lavora come utente `datespreader`) |

`datespreader --help` elenca i comandi: `init`, `migrate`, `backup` (`--list` mostra i backup), `restore`, `users list | admin | create-admin`.

## Aggiornare

```
sudo dnf upgrade ./datespreader-NUOVO.noarch.rpm
```
Il servizio viene riavviato: prima di applicare le modifiche al database della nuova versione fa da solo un backup.
Nel portale versione e data di rilascio sono accanto al nome, in alto a sinistra (es. `v0.27.0-1.el10`: il numero
dopo il trattino è la release del pacchetto).

## Spostare un'installazione esistente sul pacchetto

1. Sul vecchio server: `datespreader backup` (o la schermata Backup), poi copia il file `.sqlite3` su quello nuovo.
2. Sul nuovo server, dopo aver installato il pacchetto:
   ```
   sudo install -o datespreader -g datespreader -m 0640 FILE.sqlite3 /var/lib/datespreader/backups/
   sudo systemctl stop datespreader
   sudo datespreader restore /var/lib/datespreader/backups/FILE.sqlite3 --yes
   sudo systemctl start datespreader
   ```
   Utenti, password e dati arrivano con il database. L'installazione ripristinata riceve una nuova identità per la
   sincronizzazione tra installazioni.

## Rimuovere

`sudo dnf remove datespreader`. I dati in `/var/lib/datespreader` e la configurazione restano: cancellali a mano se
non servono più.
