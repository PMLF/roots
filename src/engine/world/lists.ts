/**
 * Listas de nomes por família linguística (RZ-132). Escritas por nós, ordenadas da mais para a menos
 * frequente (o gerador favorece o início). Sem dados do FM nem de pessoas reais.
 * `estilo` diz como se monta o nome completo (ver `nomes.ts`).
 */
type StyleName = "pt" | "es" | "simple" | "western";
export type ListNames = { style: StyleName; own: readonly string[]; surnames: readonly string[] };

const l = (s: string) => s.trim().split(/\s+/);

export const LISTS: Record<string, ListNames> = {
  portugal: {
    style: "pt",
    own: l("João Pedro Miguel Rui Tiago Diogo André Bruno Nuno Ricardo Hugo Gonçalo Rafael Filipe Paulo Carlos Luís José Manuel António Francisco Daniel Fábio Sérgio Vítor Marco Simão Duarte Tomás Henrique Afonso Renato Gil Telmo Rúben Jorge Eduardo Álvaro Mário Samuel Leandro Emanuel Joel Cláudio Nelson Hélder Orlando Armando Vasco"),
    surnames: l("Silva Santos Ferreira Pereira Oliveira Costa Rodrigues Martins Jesus Sousa Fernandes Gonçalves Gomes Lopes Marques Alves Almeida Ribeiro Pinto Carvalho Teixeira Moreira Correia Mendes Nunes Soares Vieira Monteiro Cardoso Rocha Raposo Neves Coelho Cruz Cunha Pires Ramos Reis Simões Antunes Matos Fonseca Barbosa Tavares Lourenço Machado Araújo Freitas Baptista Batista Esteves Moura Henriques Campos Faria Morais Duarte Valente Guerreiro Figueiredo Nogueira Seixas Brito Camacho Sampaio"),
  },
  brazil: {
    style: "pt",
    own: l("Lucas Gabriel Matheus Rafael Pedro Guilherme Felipe Bruno Thiago Gustavo Leonardo Rodrigo Vinícius Eduardo Carlos Wellington Anderson Diego Renan Willian Everton Wesley Jefferson Douglas Caio Danilo Jhonatan Cauã Davi Kauê Ruan Yuri Murilo Otávio Reinaldo Adriano Cleiton Josué Natan"),
    surnames: l("Silva Santos Oliveira Souza Lima Pereira Ferreira Costa Rodrigues Almeida Nascimento Araújo Ribeiro Carvalho Gomes Martins Barbosa Rocha Cardoso Moreira Dias Teixeira Cavalcante Monteiro Freitas Moura Barros Pinto Mendes Batista Campos Azevedo Medeiros Vasconcelos Tavares Siqueira Peixoto Brandão Nogueira Duarte Machado Fonseca"),
  },
  africa_pt: {
    style: "pt",
    own: l("Manuel António José Carlos Paulo Domingos Joaquim Eduardo Mário Fernando Alberto Armando Délcio Nuno Edson Elton Kevin Ailton Wilson Ivan Garcia Mauro Nelson Lisandro Bruno Edgar Ricardo Tiago Gilson Ryan Osvaldo Fredy"),
    surnames: l("Silva Santos Fernandes Monteiro Lopes Gomes Mendes Tavares Pereira Correia Barbosa Rodrigues Cardoso Semedo Duarte Varela Évora Furtado Brito Sanches Andrade Baptista Cabral Ramos Lima Borges Delgado Djaló Embaló Sambu Cassamá Nhaga Mandinga Macamo Chissano Sitoe Mabunda Cossa Tembe Dombaxe Neto Kialunda Quiala Mateus Ferreira"),
  },
  spain: {
    style: "es",
    own: l("Antonio José Manuel Francisco David Juan Javier Daniel Carlos Miguel Alejandro Rafael Pablo Sergio Jorge Álvaro Adrián Iván Rubén Raúl Diego Marcos Hugo Víctor Mario Gonzalo Martín Nicolás Santiago Mateo Fernando Luis Ángel Pedro Enrique Joaquín Ignacio Andrés Cristian Ezequiel Facundo Lucas Matías Gustavo Federico Maximiliano Leandro Santiago Emiliano Julián"),
    surnames: l("García Rodríguez González Fernández López Martínez Sánchez Pérez Gómez Martín Jiménez Ruiz Hernández Díaz Moreno Muñoz Álvarez Romero Alonso Gutiérrez Navarro Torres Domínguez Vázquez Ramos Gil Ramírez Serrano Blanco Molina Morales Suárez Ortega Delgado Castro Ortiz Rubio Marín Sanz Iglesias Medina Cortés Garrido Castillo Santos Lozano Guerrero Cano Prieto Méndez Cruz Flores Herrera Peña Acosta Benítez Giménez Paz Silva Rojas Vera Aguirre Ibarra Quiroga Pereyra Sosa Acuña"),
  },
  france: {
    style: "western",
    own: l("Lucas Hugo Théo Nathan Louis Maxime Antoine Thomas Alexandre Kevin Julien Romain Mathieu Florian Clément Yann Baptiste Adrien Quentin Benjamin Corentin Ousmane Moussa Ibrahima Aymeric Rayan Mehdi Samir Bilal Karim Jordan Dylan Enzo Axel Valentin Tanguy Loïc Gaël Jérémy Steven Franck Cédric Anthony Wesley Yohan Jules"),
    surnames: l("Martin Bernard Dubois Thomas Robert Richard Petit Durand Leroy Moreau Simon Laurent Lefebvre Michel Garcia David Bertrand Roux Vincent Fournier Morel Girard André Lefèvre Mercier Dupont Lambert Bonnet François Martinez Legrand Garnier Faure Rousseau Blanc Guerin Muller Henry Roussel Nicolas Perrin Morin Mathieu Clément Gauthier Dumont Lopes Fontaine Chevalier Robin Masson Sanchez Gérard Nguyen Diallo Traoré Koné Camara Diarra Sissoko Bamba Keita Touré"),
  },
  germany: {
    style: "western",
    own: l("Lukas Leon Jonas Tim Felix Maximilian Paul Luca Jan Niklas Finn Tom Philipp Moritz Florian Sebastian Tobias Marcel Kevin Dominik Patrick Stefan Michael Thomas Andreas Markus Christian Matthias Julian Kai Nico Robin Fabian Leroy Timo Sven Lars Jens Matti Noah Elias Ben Henrik Dennis Alexander Daniel"),
    surnames: l("Müller Schmidt Schneider Fischer Weber Meyer Wagner Becker Schulz Hoffmann Schäfer Koch Bauer Richter Klein Wolf Schröder Neumann Schwarz Zimmermann Braun Krüger Hofmann Hartmann Lange Schmitt Werner Schmitz Krause Meier Lehmann Schmid Schulze Maier Köhler Herrmann König Walter Mayer Huber Kaiser Fuchs Peters Lang Scholz Möller Weiß Jung Hahn Keller Vogel Frank Berger Winkler Roth Beck Lorenz Baumann Franke Albrecht Schuster Simon Ludwig Böhm Winter Kraus Martin Schumacher Krämer Vogt Stein Jäger Otto Sommer Gross Seidel Heinrich Brandt Haas Schreiber Graf Dietrich Ziegler Kuhn Pohl Engel Horn Busch Bergmann Thomas Voigt Sauer Arnold Wolff Pfeiffer"),
  },
  anglo: {
    style: "western",
    own: l("James Jack Thomas Daniel Harry Oliver George Charlie Joshua William Samuel Ben Callum Connor Ryan Liam Luke Adam Jordan Marcus Kyle Aaron Nathan Declan Sean Patrick Cian Ryan Mason Tyler Ethan Dylan Brandon Jayden Kieran Alfie Reece Jamie Craig Scott Gareth Rhys Ewan Callan Jude Mark Paul Andrew Michael David"),
    surnames: l("Smith Jones Taylor Brown Williams Wilson Johnson Davies Robinson Wright Thompson Evans Walker White Roberts Green Hall Wood Jackson Clarke Turner Hughes Edwards Hill Moore Clark Harrison Scott Young Morgan Lee Patel King Baker Harris Ward Allen Cooper Bennett Murphy Kelly Byrne Walsh Doyle O'Brien Ryan Brennan Murray Campbell Stewart MacDonald Reid Graham Fraser Hunt Mills Barnes Fisher Gray Price Shaw Grant Mitchell Phillips Carter Ross Palmer Dixon Bell Sutton Holmes Webb"),
  },
  italy: {
    style: "western",
    own: l("Francesco Alessandro Andrea Lorenzo Matteo Luca Marco Davide Simone Federico Gabriele Riccardo Giuseppe Antonio Giovanni Stefano Paolo Roberto Fabio Mattia Nicolò Samuele Tommaso Leonardo Emanuele Alberto Daniele Salvatore Vincenzo Pietro Diego Cristian Michele Claudio Manuel Edoardo Giacomo Domenico Raffaele Gianluca Massimo Ciro"),
    surnames: l("Rossi Russo Ferrari Esposito Bianchi Romano Colombo Ricci Marino Greco Bruno Gallo Conti De Luca Mancini Costa Giordano Rizzo Lombardi Moretti Barbieri Fontana Santoro Mariani Rinaldi Caruso Ferraro Gatti Leone Longo Martini Vitale Serra Coppola D'Angelo Pellegrini Palumbo Sanna Fabbri Bernardi Parisi Villa Testa Valentini Basile Benedetti Silvestri Farina Orlando Sartori Neri Cattaneo Morelli Amato Ferri Monti Piras Marchetti Sala Fiore Guerra Messina Pagano"),
  },
  dutch: {
    style: "western",
    own: l("Daan Sem Lucas Milan Levi Luuk Thijs Jesse Bram Ruben Tim Stijn Joost Sander Jeroen Maarten Wouter Niels Rick Koen Dennis Mitchell Kevin Jorrit Ricardo Gianni Noa Lars Jens Pieter Joris Thomas Mathijs Teun Floris Hidde Gijs Sven Cas Dirk Wesley Steven Gregory"),
    surnames: l("de Jong Jansen de Vries van den Berg van Dijk Bakker Janssen Visser Smit Meijer de Boer Mulder de Groot Bos Vos Peters Hendriks van Leeuwen Dekker Brouwer de Wit Dijkstra Smits de Graaf van der Meer van der Linden Kok Jacobs de Haan Vermeulen van den Heuvel van der Veen van den Broek de Bruijn de Bruin van der Heijden Schouten van Beek Willems van Vliet Hoekstra Maas Verhoeven Koster Prins Huisman Peeters Maes Claes Jacobs Mertens Willems Goossens Wouters De Smet Dubois Lambert Janssens"),
  },
  nordic: {
    style: "western",
    own: l("Erik Lars Anders Johan Nils Karl Magnus Oskar Emil Viktor Henrik Mikael Jonas Fredrik Mathias Martin Kristian Rasmus Mads Jesper Søren Thomas Morten Jens Bjørn Ole Stian Håkon Sondre Andreas Tobias Simon Filip Alexander Gustav Hampus Jakob Albin Isak Sebastian Joakim Marcus"),
    surnames: l("Andersson Johansson Karlsson Nilsson Eriksson Larsson Olsson Persson Svensson Gustafsson Hansen Nielsen Jensen Pedersen Andersen Christensen Larsen Sørensen Rasmussen Jørgensen Petersen Madsen Kristensen Olsen Thomsen Christiansen Poulsen Johansen Møller Mortensen Berg Lindqvist Lindgren Holm Dahl Haugen Bakken Eide Strand Moen Solberg Lund Nygård Halvorsen Johnsen Kristiansen Berglund Sandberg Forsberg"),
  },
  east: {
    style: "western",
    own: l("Jan Piotr Marek Tomasz Paweł Michał Krzysztof Andrzej Jakub Mateusz Bartosz Adam Łukasz Oleksandr Andriy Serhiy Dmytro Mykola Taras Ihor Vitaliy Artem Maksym Bohdan Aleksei Dmitri Sergei Ivan Nikolai Vladimir Georgi Dimitar Stefan Nikola Petar Viktor Radu Andrei Mihai Cristian Florin Marian Vasile Ionut Ondrej Tomas Lukas Vaclav Martin Jiri"),
    surnames: l("Kowalski Nowak Wiśniewski Wójcik Kowalczyk Kamiński Lewandowski Zieliński Szymański Woźniak Dąbrowski Kozłowski Jankowski Mazur Kwiatkowski Krawczyk Piotrowski Grabowski Shevchenko Kovalenko Bondarenko Tkachenko Kravchenko Boyko Melnyk Shevchuk Polishchuk Koval Ivanov Petrov Smirnov Kuznetsov Popov Sokolov Lebedev Volkov Novikov Morozov Georgiev Dimitrov Ivanov Petkov Stoyanov Popescu Ionescu Popa Stan Dumitru Gheorghe Constantin Marin Novák Svoboda Novotný Dvořák Černý Procházka Kučera Veselý Horák Němec Pokorný"),
  },
  balkans: {
    style: "western",
    own: l("Marko Nikola Stefan Luka Ivan Milan Miloš Aleksandar Nemanja Dušan Filip Vladimir Darko Zoran Goran Dejan Josip Ante Mateo Domagoj Mario Tomislav Ivica Davor Kristijan Ognjen Andrej Petar Mladen Edin Amar Haris Dino Adnan Nikos Giorgos Dimitris Kostas Yannis Panagiotis Christos Vasilis Thanasis Stelios"),
    surnames: l("Jovanović Petrović Nikolić Marković Đorđević Stojanović Ilić Pavlović Todorović Kovačević Horvat Kovač Babić Marić Jurić Matić Knežević Vuković Perić Tomić Bošnjak Hodžić Hadžić Delić Mehmedović Kovačić Papadopoulos Papadakis Georgiou Nikolaou Dimitriou Konstantinou Vasileiou Ioannou Karagiannis Alexiou Antoniou Pappas Makris Oikonomou"),
  },
  turkey: {
    style: "western",
    own: l("Mehmet Mustafa Ahmet Ali Hüseyin Hasan İbrahim Yusuf Murat Emre Burak Can Cem Kerem Oğuz Enes Arda Barış Berkay Cenk Efe Kaan Onur Ozan Serkan Selçuk Tolga Umut Volkan Yiğit Furkan Gökhan Kemal Ömer Hakan Deniz Tunahan Salih Okan Burhan"),
    surnames: l("Yılmaz Kaya Demir Şahin Çelik Yıldız Yıldırım Öztürk Aydın Özdemir Arslan Doğan Kılıç Aslan Çetin Kara Koç Kurt Özkan Şimşek Polat Korkmaz Özcan Çakır Erdoğan Yavuz Can Acar Şen Aksoy Güneş Aktaş Tekin Güler Ünal Bulut Turan Karaca Duman Tuncer Bozkurt Ateş Erdem Sönmez"),
  },
  maghreb: {
    style: "western",
    own: l("Mohamed Ahmed Youssef Omar Karim Hamza Ayoub Bilal Mehdi Rachid Samir Nabil Walid Anas Zakaria Ismail Amine Yassine Soufiane Hicham Reda Achraf Sofiane Riyad Ramy Islam Mahmoud Mostafa Tarek Hossam Amr Khaled Wael Marwan Said Nordine Farid Djamel Adel Hakim Abdel Brahim"),
    surnames: l("Benali Amrani Alaoui Idrissi Tazi Bennani Berrada Chraibi Fassi Saidi Haddad Mansouri Belkacem Boudiaf Brahimi Bouzid Cherif Hassan Mohamed Ibrahim Mostafa Abdallah Farouk Nasser Ali Khalil Said Saleh Ahmed Mahmoud"),
  },
  africa_fr: {
    style: "western",
    own: l("Moussa Ibrahima Mamadou Ousmane Cheikh Abdoulaye Idrissa Boubacar Pape Youssouf Seydou Amadou Lamine Aliou Serigne Gorgui Ismaïla Yaya Serge Franck Eric Emmanuel Christian Jean Pierre Paul Patrick Samuel Vincent Joël Alain Rigobert Arnaud Fabrice Hervé Cédric Rodrigue Steve Gabriel Jérôme Landry Brice Thierry"),
    surnames: l("Diallo Traoré Koné Camara Diarra Sissoko Bamba Keita Touré Cissé Sow Ndiaye Diop Fall Gueye Sarr Mbaye Ba Faye Sy Mendy Niang Sène Thiam Kouyaté Coulibaly Ouattara Yao Kouassi Konan Kouamé Mbarga Ngadeu Kunde Mputu Kabongo Tshimanga Mukendi Ilunga Ebanga Obiang Evouna"),
  },
  africa_en: {
    style: "western",
    own: l("Emmanuel Chukwuemeka Obinna Ikechukwu Nnamdi Oluwaseun Tunde Kelechi Samuel Victor Joseph Daniel Moses Ahmed Musa Wilfred Henry Alex Kingsley Ola Sadiq Taiwo Kwame Kofi Kwesi Yaw Kwabena Mohammed Thomas Jordan Andre Daniel Iddrisu Gideon Richmond Baba Tariq"),
    surnames: l("Okafor Okonkwo Eze Nwosu Adeyemi Balogun Ibrahim Abdullahi Musa Bello Yusuf Ogunleye Adebayo Ajayi Olawale Mensah Owusu Asante Boateng Appiah Adjei Acheampong Amartey Lamptey Baba Wakaso Tagoe Opoku Frimpong Danso Salisu Djiku"),
  },
  central_asia: {
    style: "western",
    own: l("Aziz Rustam Jasur Eldor Odil Sardor Timur Bobur Akmal Sherzod Otabek Islom Dilshod Farhod Mirjalol Ulugbek Javlon Abbos Shakhzod Mohammad Reza Ali Hossein Mehdi Saeed Ehsan Sardar Alireza Amir Majid Karim Behrouz Omid Navid Kaveh Arash Vahid"),
    surnames: l("Karimov Rakhimov Abdullaev Yusupov Ismoilov Rustamov Nazarov Tursunov Saidov Kholmatov Mirzaev Ergashev Alimov Sultanov Khodjaev Azimov Ahmadi Hosseini Rezaei Mohammadi Karimi Jafari Ghorbani Mahdavi Heidari Ebrahimi Kazemi Nouri Rahimi Moradi Sadeghi Esmaili"),
  },
  japan: {
    style: "western",
    own: l("Haruto Yuto Sota Yuki Kaito Ren Takumi Daiki Kenta Ryo Shota Hiroki Takeshi Kazuki Naoki Shun Riku Ryota Masato Koki Yuya Shinji Keisuke Genki Kosei Wataru"),
    surnames: l("Sato Suzuki Takahashi Tanaka Watanabe Ito Yamamoto Nakamura Kobayashi Kato Yoshida Yamada Sasaki Yamaguchi Matsumoto Inoue Kimura Hayashi Shimizu Yamazaki Mori Abe Ikeda Hashimoto Ishikawa Ogawa Goto Okada Hasegawa Fujita Kondo Endo Aoki Sakamoto Murata Ota Nagai Morita Maeda"),
  },
  korea: {
    style: "western",
    own: l("Seung-ho Jae-sung Sun-woo Ji-hoon Hyun-woo Dong-gyu Tae-hyun Joon-ho Sang-ho Young-woo Seung-gyu Hyeon-gyu Ji-sung Dong-jun Jin-su Young-gwon Bum-geun"),
    surnames: l("Kim Lee Park Choi Jung Kang Cho Yoon Jang Lim Han Oh Seo Shin Kwon Hwang Ahn Song Yoo Hong Jeon Ko Moon Yang Son Bae Baek Heo Nam Sim Noh"),
  },
};
